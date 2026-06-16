# --- build stage ---
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags "-X ctracking/backend/internal/handlers.Version=$(date +%Y%m%d)" -o /out/server ./cmd/server

# --- run stage ---
FROM alpine:3.20
RUN adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /out/server /app/server
RUN mkdir -p /app/storage/screenshots && chown -R app /app
USER app
EXPOSE 8080
ENTRYPOINT ["/app/server"]
