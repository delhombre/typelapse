#!/usr/bin/env bash
# The two services the hosted journeys need, as throwaway containers:
# PostgreSQL 16 and MinIO behind TLS. The R2 adapter refuses any endpoint that
# is not https (server/storage/r2-object-storage.ts), so MinIO gets a
# self-signed certificate made here, and Node trusts it through
# NODE_EXTRA_CA_CERTS. Production is untouched: nothing here loosens the adapter.
#
#   tests/e2e/hosted/services.sh up      certificate, PostgreSQL and MinIO
#   tests/e2e/hosted/services.sh certs   the certificate only
#   tests/e2e/hosted/services.sh minio   the certificate and MinIO (CI, where
#                                        PostgreSQL is a service container)
#   tests/e2e/hosted/services.sh down    remove both containers
#
# Ports, names and the state folder follow the same variables as
# playwright.config.ts, so the two always agree.
set -euo pipefail

STATE="${E2E_HOSTED_STATE:-${TMPDIR:-/tmp}/typelapse-e2e-hosted}"
STATE="${STATE%/}"
PG_PORT="${E2E_PG_PORT:-54381}"
MINIO_PORT="${E2E_MINIO_PORT:-9181}"
PG_CONTAINER="${E2E_PG_CONTAINER:-typelapse-e2e-pg}"
MINIO_CONTAINER="${E2E_MINIO_CONTAINER:-typelapse-e2e-minio}"
# MinIO no longer publishes community images (minio/minio is gone from Docker
# Hub); Chainguard's build is public, maintained, and starts the same binary.
MINIO_IMAGE="${E2E_MINIO_IMAGE:-cgr.dev/chainguard/minio:latest}"

certs() {
	mkdir -p "$STATE/certs"
	if [[ -s "$STATE/certs/public.crt" && -s "$STATE/certs/private.key" ]]; then
		return
	fi
	openssl req -x509 -newkey rsa:2048 -nodes -days 7 \
		-keyout "$STATE/certs/private.key" -out "$STATE/certs/public.crt" \
		-subj "/CN=localhost" \
		-addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
		-addext "basicConstraints=critical,CA:TRUE" 2>/dev/null
	# The MinIO image runs as a non-root user that must read the key; it is a
	# throwaway test key.
	chmod 644 "$STATE/certs/private.key" "$STATE/certs/public.crt"
	echo "certificate: $STATE/certs/public.crt"
}

wait_for() {
	local what="$1"
	shift
	for _ in $(seq 1 60); do
		if "$@" >/dev/null 2>&1; then
			echo "$what is up"
			return
		fi
		sleep 1
	done
	echo "$what did not come up" >&2
	exit 1
}

postgres() {
	docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
	docker run -d --name "$PG_CONTAINER" \
		-e POSTGRES_PASSWORD=typelapse -e POSTGRES_DB=typelapse \
		-p "127.0.0.1:$PG_PORT:5432" postgres:16-alpine >/dev/null
	wait_for PostgreSQL docker exec "$PG_CONTAINER" pg_isready -U postgres -d typelapse
}

minio() {
	certs
	docker rm -f "$MINIO_CONTAINER" >/dev/null 2>&1 || true
	docker run -d --name "$MINIO_CONTAINER" \
		-e MINIO_ROOT_USER=typelapse -e MINIO_ROOT_PASSWORD=typelapse1234 \
		-v "$STATE/certs:/certs:ro" \
		-p "127.0.0.1:$MINIO_PORT:9000" "$MINIO_IMAGE" server /tmp/minio --certs-dir /certs >/dev/null
	wait_for MinIO curl --silent --fail --cacert "$STATE/certs/public.crt" \
		"https://localhost:$MINIO_PORT/minio/health/ready"
}

case "${1:-}" in
up)
	certs
	postgres
	minio
	;;
certs) certs ;;
minio) minio ;;
down)
	docker rm -f "$PG_CONTAINER" "$MINIO_CONTAINER" >/dev/null 2>&1 || true
	echo "removed $PG_CONTAINER and $MINIO_CONTAINER"
	;;
*)
	echo "usage: $0 up | certs | minio | down" >&2
	exit 2
	;;
esac
