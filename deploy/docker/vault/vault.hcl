ui = false
disable_mlock = true
enable_unauthenticated_access = ["generate-root"]
api_addr = "https://nexora-vault:8200"
cluster_addr = "https://nexora-vault:8201"

storage "raft" {
  path    = "/vault/data"
  node_id = "nexora-vault"
}

listener "tcp" {
  address         = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"
  tls_cert_file   = "/vault/tls/vault.crt"
  tls_key_file    = "/vault/tls/vault.key"
  tls_min_version = "tls12"
}
