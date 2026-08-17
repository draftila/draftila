CREATE TABLE IF NOT EXISTS "draft_update" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "draft_id" TEXT NOT NULL,
    "payload" BLOB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "draft_update_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "draft_update_draft_id_idx" ON "draft_update"("draft_id", "id");
