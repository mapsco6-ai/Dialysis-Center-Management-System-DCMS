-- CreateIndex
CREATE UNIQUE INDEX "session_supply_issue_items_scheduleId_substituteForItemId_key" ON "session_supply_issue_items"("scheduleId", "substituteForItemId");

