output "aks_oidc_issuer_url" {
  description = "Feed this to the federated identity credentials of any new service."
  value       = azurerm_kubernetes_cluster.aks.oidc_issuer_url
}

output "postgres_fqdn" {
  value = azurerm_postgresql_flexible_server.warehouse.fqdn
}

output "eventhub_bootstrap_servers" {
  description = "Kafka-protocol endpoint for the ingest service."
  value       = "${azurerm_eventhub_namespace.stream.name}.servicebus.windows.net:9093"
}

output "lake_storage_account" {
  value = azurerm_storage_account.lake.name
}

output "databricks_workspace_url" {
  value = azurerm_databricks_workspace.lakehouse.workspace_url
}

output "service_identity_client_ids" {
  description = "Client IDs to stamp on the Kubernetes service accounts."
  value       = { for key, identity in azurerm_user_assigned_identity.services : key => identity.client_id }
}
