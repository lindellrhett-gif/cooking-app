-- Live updates between people in the same kitchen.
--
-- Without this the app still works, it just stops updating on its own: one
-- phone would not see the other tick something off the shopping list.

alter publication supabase_realtime add table pantry_items;
alter publication supabase_realtime add table shopping_list_items;
alter publication supabase_realtime add table household_staple_optouts;

-- Delete events carry only the primary key by default, so a subscription
-- filtered on household_id never matches them: the other phone would see
-- items appear but never disappear. Full replica identity puts the old row in
-- the event so the filter has something to match.
alter table pantry_items             replica identity full;
alter table shopping_list_items      replica identity full;
alter table household_staple_optouts replica identity full;
