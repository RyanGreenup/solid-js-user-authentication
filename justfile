set shell := ["zsh", "-cu"]

run:
    REGISTRATION_ENABLED="true" \
    SESSION_SECRET="qOpofxKBxLRmWNyqrCvEMAn1DJWiuom8tya9eDND5HA=" \
    DB_PATH="./eg_notes.sqlite" \
    pnpm run dev -- --host

# run:
#     DB_PATH="./eg_notes.sqlite" \
#     pnpm run dev

# run:
#     SESSION_SECRET="qOpofxKBxLRmWNyqrCvEMAn1DJWiuom8tya9eDND5HA=" \
#     pnpm run dev
