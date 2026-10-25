# Smoke Tests - Deleted Tab Feature

## Prerequisites
- Fresh build of the app with Deleted tab enabled
- Some clipboard history available

## Test Cases

### 1. Soft Delete from History
- [ ] Copy some text items to populate history
- [ ] Delete an item from the main view (trash icon on item or clear view)
- [ ] Item should disappear from history
- [ ] Deleted tab count should increment
- [ ] Switch to Deleted tab - item should appear there

### 2. TTL Display
- [ ] In Deleted tab, item shows "Xs left" or "Xm Ys left" countdown
- [ ] Countdown decreases over time
- [ ] After TTL expires, item is automatically removed from Deleted tab

### 3. Undo/Restore
- [ ] In Deleted tab, click "Undo" (↶) button on an item
- [ ] Item should be removed from Deleted tab
- [ ] Switch to All/Text tab - item should appear in history at its original position
- [ ] Item should not be pinned by default after restore

### 4. Permanent Delete from Deleted Tab
- [ ] In Deleted tab, click trash button on an item
- [ ] Item should be immediately removed from Deleted tab
- [ ] Item should not appear anywhere in history

### 5. Clear from Deleted Tab
- [ ] Have multiple items in Deleted tab
- [ ] Click trash icon in header (clear button) while in Deleted tab
- [ ] All items in Deleted tab should be permanently deleted
- [ ] Deleted tab should be empty

### 6. Pinned Items Protection
- [ ] Pin an item in history
- [ ] Try to delete it - should be blocked or moved to deleted only if unlocked? (Pinned items cannot be deleted)
- [ ] Unpin the item, then delete it - should go to Deleted tab

### 7. Re-copy Removes from Deleted
- [ ] Copy an item and delete it (goes to Deleted tab)
- [ ] Copy the same content again from another source
- [ ] Item should be removed from Deleted tab
- [ ] New copy should appear at top of history

### 8. Clear View Respects Pinned
- [ ] Pin some items, leave unpinned items
- [ ] In All tab, click clear button
- [ ] Pinned items should remain in history
- [ ] Unpinned items should go to Deleted tab

### 9. Search in Deleted Tab
- [ ] Have items in Deleted tab
- [ ] Use search to filter deleted items
- [ ] Only matching deleted items should be shown
- [ ] Clear search - all deleted items shown again

### 10. TTL Configuration
- [ ] Default TTL is 60 seconds
- [ ] TTL can be configured between 60-600 seconds (if UI exists)

## Expected Behavior
- Deleted items are soft-deleted with TTL
- Undo restores to original position in history
- Permanent delete from Deleted tab is immediate
- Expired items are auto-purged
- Pinned items are never auto-deleted
- Re-copying removes tombstone
