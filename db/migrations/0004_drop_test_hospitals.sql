-- Removes the V7.6.5c test hospitals (0003_test_hospitals.sql). Migrations only run forward, so 0003 stays in
-- place and stays recorded in schema_migrations: deleting its row would make the next npm run db:migrate apply
-- it again. On a new database, 0003 then 0004 leave nothing behind.

-- A test hospital's facility row means nothing without its made-up data, so it goes too. Its organization and
-- people stay; anyone given only that facility is left with none until someone gives them another.
delete from facilities f using sandbox_hospitals s where s.facility_id = f.id;

drop function padua_sign_up_with_test_hospital(text, text, text, text, integer, text, text, text);
drop function padua_add_test_hospital(text, text, text, integer);
drop function padua_new_test_hospital(uuid, text, text, text, integer);
drop table sandbox_hospitals;
