BEGIN;
SELECT plan(1);

SELECT is(
  current_setting('TimeZone'),
  'UTC',
  'Database timezone must stay UTC'
);

SELECT * FROM finish();
ROLLBACK;
