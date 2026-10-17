"""The UF residence options shown to users and ranked on the dorm board."""

DORM_CATALOG = (
    ("beaty_towers", "Beaty Towers"),
    ("broward_hall", "Broward Hall"),
    ("buckman_hall", "Buckman Hall"),
    ("cypress_hall", "Cypress Hall"),
    ("east_hall", "East Hall"),
    ("fletcher_hall", "Fletcher Hall"),
    ("honors_village", "Honors Village"),
    ("hume_hall", "Hume Hall"),
    ("infinity_hall", "Infinity Hall"),
    ("jennings_hall", "Jennings Hall"),
    ("keys_residential_complex", "Keys Residential Complex"),
    ("lakeside_residential_complex", "Lakeside Residential Complex"),
    ("mallory_hall", "Mallory Hall"),
    ("murphree_hall", "Murphree Hall"),
    ("north_hall", "North Hall"),
    ("rawlings_hall", "Rawlings Hall"),
    ("reid_hall", "Reid Hall"),
    ("riker_hall", "Riker Hall"),
    ("sledd_hall", "Sledd Hall"),
    ("springs_residential_complex", "Springs Residential Complex"),
    ("thomas_hall", "Thomas Hall"),
    ("tolbert_hall", "Tolbert Hall"),
    ("weaver_hall", "Weaver Hall"),
    ("yulee_hall", "Yulee Hall"),
    ("off_campus", "Off campus"),
)

DORM_NAME_BY_ID = dict(DORM_CATALOG)
DORM_OPTIONS = tuple({"dormId": dorm_id, "dormName": name} for dorm_id, name in DORM_CATALOG)
