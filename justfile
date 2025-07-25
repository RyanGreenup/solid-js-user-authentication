set dotenv-load
dev:
    # Requires SESSION_SECRET in .env file
    mkdir -p .data && \
    npm run dev

admin:
    SUDO_MODE="true" \
    just dev
