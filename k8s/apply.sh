#!/usr/bin/env bash
# apply.sh — deploy / update all Placement ERP resources to K3s
# Usage:
#   ./k8s/apply.sh                   # apply everything
#   ./k8s/apply.sh backend           # apply backend only
#   ./k8s/apply.sh frontend          # apply frontend only
#   ./k8s/apply.sh metabase          # apply metabase only
#
# Run from the repo root. Requires kubectl configured for your cluster.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-all}"

apply() {
  local dir="$1"
  echo "── Applying $dir ──"
  kubectl apply -f "$SCRIPT_DIR/$dir"
  echo ""
}

# Always ensure the namespace and cert issuer exist
kubectl apply -f "$SCRIPT_DIR/00-namespace.yaml"
kubectl apply -f "$SCRIPT_DIR/01-cluster-issuer.yaml"

case "$TARGET" in
  backend)
    apply backend
    kubectl rollout status deployment/backend -n erp
    ;;
  frontend)
    apply frontend
    kubectl rollout status deployment/frontend -n erp
    ;;
  metabase)
    apply metabase
    kubectl rollout status deployment/metabase -n erp
    ;;
  all)
    apply backend
    apply frontend
    apply metabase
    echo "── Waiting for rollouts ──"
    kubectl rollout status deployment/backend  -n erp
    kubectl rollout status deployment/frontend -n erp
    kubectl rollout status deployment/metabase -n erp
    ;;
  *)
    echo "Unknown target: $TARGET"
    echo "Usage: $0 [backend|frontend|metabase|all]"
    exit 1
    ;;
esac

echo ""
echo "✓ Done. Pod status:"
kubectl get pods -n erp
