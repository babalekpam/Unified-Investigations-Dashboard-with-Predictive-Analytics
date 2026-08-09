variable "environment" {
  description = "Deployment environment: dev, stage or prod."
  type        = string
  validation {
    condition     = contains(["dev", "stage", "prod"], var.environment)
    error_message = "environment must be one of dev, stage, prod."
  }
}

variable "location" {
  description = "Azure region."
  type        = string
  default     = "southcentralus"
}

variable "tenant_id" {
  description = "Entra ID tenant that issues dashboard tokens."
  type        = string
}

variable "vnet_cidr" {
  description = "Address space for the hub VNet."
  type        = string
  default     = "10.42.0.0/16"
}

variable "aks_node_size" {
  type    = string
  default = "Standard_D4s_v5"
}

variable "aks_admin_group_object_ids" {
  description = "Entra groups granted cluster-admin."
  type        = list(string)
  default     = []
}

variable "eventhub_capacity" {
  description = "Throughput units. One unit handles roughly 1 MB/s ingress."
  type        = number
  default     = 2
}

variable "postgres_sku" {
  type    = string
  default = "GP_Standard_D4s_v3"
}

variable "postgres_storage_mb" {
  type    = number
  default = 262144
}

variable "postgres_admin_user" {
  type      = string
  sensitive = true
}

variable "postgres_admin_password" {
  description = "Bootstrap password only. Application access uses Entra tokens; this exists because the server requires an initial administrator."
  type        = string
  sensitive   = true
}
