"""Run with: docker compose exec backend python -m app.run_seed"""

import sys

# ./database:/database is mounted into the backend container alongside
# ./backend:/app (see docker-compose.yml).
sys.path.insert(0, "/database/seed")

from seed_products import run  # noqa: E402

if __name__ == "__main__":
    run()
