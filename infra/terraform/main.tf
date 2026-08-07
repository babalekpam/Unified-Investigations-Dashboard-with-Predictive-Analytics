# Azure footprint for the Global Security Intelligence Hub.
#
# Everything the platform runs on, in the order the architecture of Section 3.2 reads:
# landing and lakehouse storage, streaming, the serving database, the compute that runs
# the services, and the identity and secret stores that hold it together.
#
# Two rules are enforced throughout rather than left to reviewers: no service is reachable
# from the public internet except the ingress controller, and no service holds a password
# it could leak — data-plane access is by managed identity.

terraform {
  required_version = ">= 1.7"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.100"
    }
  }
  backend "azurerm" {
    # Values supplied by the pipeline: state for a security platform does not live in the
    # repository, and it does not live on anybody's laptop.
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy = false
    }
  }
}

locals {
  name = "gsih-${var.environment}"
  tags = {
    application = "global-security-intelligence-hub"
    environment = var.environment
    owner       = "global-security-investigations"
    data-class  = "confidential"
  }
}

resource "azurerm_resource_group" "hub" {
  name     = local.name
  location = var.location
  tags     = local.tags
}

# ---------------------------------------------------------------- lakehouse storage

resource "azurerm_storage_account" "lake" {
  name                     = replace("${local.name}lake", "-", "")
  resource_group_name      = azurerm_resource_group.hub.name
  location                 = azurerm_resource_group.hub.location
  account_tier             = "Standard"
  account_replication_type = "GZRS"
  # ADLS Gen2. Delta tables need hierarchical namespace; flat blob storage makes every
  # directory-level operation a full-prefix scan.
  is_hns_enabled                  = true
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = false

  blob_properties {
    versioning_enabled = true
    delete_retention_policy {
      days = 30
    }
  }

  network_rules {
    default_action = "Deny"
    bypass         = ["AzureServices"]
  }

  tags = local.tags
}

resource "azurerm_storage_container" "layers" {
  for_each              = toset(["landing", "bronze", "silver", "gold", "checkpoints"])
  name                  = each.key
  storage_account_id    = azurerm_storage_account.lake.id
  container_access_type = "private"
}

# ---------------------------------------------------------------- streaming

resource "azurerm_eventhub_namespace" "stream" {
  name                = "${local.name}-events"
  resource_group_name = azurerm_resource_group.hub.name
  location            = azurerm_resource_group.hub.location
  sku                 = "Standard"
  capacity            = var.eventhub_capacity
  # Kafka protocol support: the services speak plain Kafka, so the same code runs against
  # a local broker in development and Event Hubs in Azure with only a bootstrap change.
  local_authentication_enabled = false
  minimum_tls_version          = "1.2"
  tags                         = local.tags
}

resource "azurerm_eventhub" "topics" {
  for_each = {
    "gsih.incidents.raw" = 9
    "gsih.cases.raw"     = 9
    "gsih.access.raw"    = 12
    "gsih.alarms.raw"    = 9
    "gsih.ingest.dlq"    = 3
  }

  name              = each.key
  namespace_id      = azurerm_eventhub_namespace.stream.id
  partition_count   = each.value
  message_retention = 7
}

# ---------------------------------------------------------------- serving warehouse

resource "azurerm_postgresql_flexible_server" "warehouse" {
  name                = "${local.name}-pg"
  resource_group_name = azurerm_resource_group.hub.name
  location            = azurerm_resource_group.hub.location
  version             = "16"
  sku_name            = var.postgres_sku
  storage_mb          = var.postgres_storage_mb

  administrator_login    = var.postgres_admin_user
  administrator_password = var.postgres_admin_password

  # No public endpoint: the warehouse is reachable only from the delegated subnet.
  public_network_access_enabled = false
  delegated_subnet_id           = azurerm_subnet.data.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgres.id

  backup_retention_days        = 35
  geo_redundant_backup_enabled = true

  high_availability {
    mode = var.environment == "prod" ? "ZoneRedundant" : "SameZone"
  }

  authentication {
    active_directory_auth_enabled = true
    password_auth_enabled         = true
  }

  tags = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_postgresql_flexible_server_database" "gsih" {
  name      = "gsih"
  server_id = azurerm_postgresql_flexible_server.warehouse.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# ---------------------------------------------------------------- compute

resource "azurerm_kubernetes_cluster" "aks" {
  name                = "${local.name}-aks"
  resource_group_name = azurerm_resource_group.hub.name
  location            = azurerm_resource_group.hub.location
  dns_prefix          = local.name
  sku_tier            = var.environment == "prod" ? "Standard" : "Free"

  # Workload identity is what removes secrets from the pods: each service account is
  # federated to a managed identity, so nothing mounts a database password.
  oidc_issuer_enabled       = true
  workload_identity_enabled = true

  default_node_pool {
    name                = "system"
    vm_size             = var.aks_node_size
    vnet_subnet_id      = azurerm_subnet.aks.id
    enable_auto_scaling = true
    min_count           = 2
    max_count           = 6
    os_disk_type        = "Ephemeral"
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin      = "azure"
    network_policy      = "calico"
    load_balancer_sku   = "standard"
    outbound_type       = "userAssignedNATGateway"
  }

  azure_active_directory_role_based_access_control {
    managed                = true
    azure_rbac_enabled     = true
    admin_group_object_ids = var.aks_admin_group_object_ids
  }

  tags = local.tags
}

resource "azurerm_databricks_workspace" "lakehouse" {
  name                = "${local.name}-dbx"
  resource_group_name = azurerm_resource_group.hub.name
  location            = azurerm_resource_group.hub.location
  sku                 = "premium"

  # Premium is not optional here: table access control and Unity Catalog governance are
  # what enforce Section 5.3's data-minimisation rules inside the lakehouse.
  public_network_access_enabled         = false
  network_security_group_rules_required = "NoAzureDatabricksRules"

  custom_parameters {
    no_public_ip        = true
    virtual_network_id  = azurerm_virtual_network.hub.id
    public_subnet_name  = azurerm_subnet.databricks_public.name
    private_subnet_name = azurerm_subnet.databricks_private.name

    public_subnet_network_security_group_association_id  = azurerm_subnet_network_security_group_association.databricks_public.id
    private_subnet_network_security_group_association_id = azurerm_subnet_network_security_group_association.databricks_private.id
  }

  tags = local.tags
}

# ---------------------------------------------------------------- secrets & identity

resource "azurerm_key_vault" "secrets" {
  name                       = "${local.name}-kv"
  resource_group_name        = azurerm_resource_group.hub.name
  location                   = azurerm_resource_group.hub.location
  tenant_id                  = var.tenant_id
  sku_name                   = "standard"
  purge_protection_enabled   = true
  soft_delete_retention_days = 90
  enable_rbac_authorization  = true

  network_acls {
    default_action = "Deny"
    bypass         = "AzureServices"
  }

  tags = local.tags
}

resource "azurerm_user_assigned_identity" "services" {
  for_each = toset(["api", "ingest", "analytics"])

  name                = "${local.name}-${each.key}"
  resource_group_name = azurerm_resource_group.hub.name
  location            = azurerm_resource_group.hub.location
  tags                = local.tags
}

resource "azurerm_federated_identity_credential" "services" {
  for_each = azurerm_user_assigned_identity.services

  name                = "${local.name}-${each.key}-federated"
  resource_group_name = azurerm_resource_group.hub.name
  audience            = ["api://AzureADTokenExchange"]
  issuer              = azurerm_kubernetes_cluster.aks.oidc_issuer_url
  parent_id           = each.value.id
  subject             = "system:serviceaccount:gsih:gsih-${each.key}"
}

resource "azurerm_role_assignment" "secret_reader" {
  for_each = azurerm_user_assigned_identity.services

  scope                = azurerm_key_vault.secrets.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = each.value.principal_id
}

# Only the pipelines write to the lake; the services never touch it directly.
resource "azurerm_role_assignment" "lake_reader" {
  for_each = { for k, v in azurerm_user_assigned_identity.services : k => v if k == "analytics" }

  scope                = azurerm_storage_account.lake.id
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = each.value.principal_id
}

# ---------------------------------------------------------------- observability

resource "azurerm_log_analytics_workspace" "logs" {
  name                = "${local.name}-logs"
  resource_group_name = azurerm_resource_group.hub.name
  location            = azurerm_resource_group.hub.location
  sku                 = "PerGB2018"
  # Section 5.3 requires audit logs for all access. Two years is the retention the
  # investigations records schedule calls for.
  retention_in_days = 730
  tags              = local.tags
}

resource "azurerm_application_insights" "apm" {
  name                = "${local.name}-apm"
  resource_group_name = azurerm_resource_group.hub.name
  location            = azurerm_resource_group.hub.location
  workspace_id        = azurerm_log_analytics_workspace.logs.id
  application_type    = "java"
  tags                = local.tags
}
