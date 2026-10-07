"""
Value pools for the v2 synthetic generator (generator_v2.py).

What changed from value_pools.py (v1), and why:
  - Geography is internally consistent. v1 drew city and governing-law
    state independently ("executed at Nagercoil ... laws of Rajasthan").
    Here every city belongs to its state, and the state drives the High
    Court, PIN code prefix, land-area units, and land-record vocabulary
    (Gat No. / Sy. No. / Khasra No. / Dag No., Khata No., 7/12 extract...).
  - Currency is written the way Indian deeds write it: lakh grouping
    (Rs. 8,90,000/-), several prefixes (Rs. / INR / the rupee sign), and
    optional amounts-in-words. v1 only produced "₹890,000".
  - Names carry gender-consistent honorifics and parentage (S/o, D/o, W/o),
    and some parties are companies (M/s. ... Pvt. Ltd.).
All randomness goes through the module-level `rng` so a whole batch is
reproducible from one seed (see generate_batch_v2.py --seed).
"""

import random

from faker import Faker

rng = random.Random()
fake = Faker("en_IN")


def seed_all(seed: int) -> None:
    rng.seed(seed)
    Faker.seed(seed)


# --- Geography ---------------------------------------------------------------
# state -> High Court, cities (name, PIN prefix, localities), land conventions.
# survey_formats: (prefix shown in text, number generator key). The prefix is
# plain text; only the number after it is labeled SURVEY_NUMBER, matching v1.
STATES = {
    "Maharashtra": {
        "high_court": "Bombay High Court",
        "cities": [
            ("Mumbai", "400", ["Andheri West", "Borivali East", "Chembur", "Dadar"]),
            ("Pune", "411", ["Kothrud", "Baner", "Hadapsar", "Wakad"]),
            ("Nagpur", "440", ["Dharampeth", "Sitabuldi", "Manish Nagar"]),
            ("Nashik", "422", ["Gangapur Road", "College Road"]),
            ("Thane", "400", ["Ghodbunder Road", "Naupada"]),
        ],
        "districts": ["Pune", "Nashik", "Satara", "Kolhapur", "Ahmednagar"],
        "survey_formats": [("Survey No.", "slash"), ("Gat No.", "plain")],
        "khata": False,
        "record": "7/12 extract",
        "area_units": ["acres", "guntha", "hectares"],
    },
    "Karnataka": {
        "high_court": "Karnataka High Court",
        "cities": [
            ("Bengaluru", "560", ["Indiranagar", "Koramangala", "Jayanagar", "Whitefield"]),
            ("Mysuru", "570", ["Vijayanagar", "Kuvempunagar"]),
            ("Hubballi", "580", ["Vidyanagar", "Gokul Road"]),
        ],
        "districts": ["Mandya", "Tumakuru", "Hassan", "Mysuru"],
        "survey_formats": [("Sy. No.", "slash"), ("Survey No.", "slash")],
        "khata": True,
        "record": "RTC (Pahani)",
        "area_units": ["acres", "guntha"],
    },
    "Tamil Nadu": {
        "high_court": "Madras High Court",
        "cities": [
            ("Chennai", "600", ["Adyar", "T. Nagar", "Velachery", "Anna Nagar"]),
            ("Coimbatore", "641", ["R.S. Puram", "Saibaba Colony"]),
            ("Madurai", "625", ["K.K. Nagar", "Anna Nagar"]),
            ("Nagercoil", "629", ["Vadasery", "Kottar"]),
        ],
        "districts": ["Kancheepuram", "Thanjavur", "Erode", "Tiruvallur"],
        "survey_formats": [("S.F. No.", "slash"), ("Survey No.", "slash")],
        "khata": False,
        "record": "Patta",
        "area_units": ["acres", "cents", "hectares"],
    },
    "Telangana": {
        "high_court": "Telangana High Court",
        "cities": [
            ("Hyderabad", "500", ["Banjara Hills", "Gachibowli", "Kukatpally", "Madhapur"]),
            ("Warangal", "506", ["Hanamkonda", "Kazipet"]),
        ],
        "districts": ["Rangareddy", "Medak", "Nalgonda"],
        "survey_formats": [("Sy. No.", "slash"), ("Survey No.", "slash")],
        "khata": False,
        "record": "Pahani",
        "area_units": ["acres", "guntas"],
    },
    "Delhi": {
        "high_court": "Delhi High Court",
        "cities": [("New Delhi", "110", ["Lajpat Nagar", "Dwarka", "Rohini", "Saket"])],
        "districts": ["South West Delhi", "North West Delhi"],
        "survey_formats": [("Khasra No.", "slash")],
        "khata": False,
        "record": "Khatauni",
        "area_units": ["bigha", "sq. yards"],
    },
    "Gujarat": {
        "high_court": "Gujarat High Court",
        "cities": [
            ("Ahmedabad", "380", ["Navrangpura", "Satellite", "Bopal"]),
            ("Surat", "395", ["Adajan", "Vesu"]),
            ("Vadodara", "390", ["Alkapuri", "Gotri"]),
        ],
        "districts": ["Kheda", "Anand", "Mehsana", "Bharuch"],
        "survey_formats": [("Survey No.", "slash"), ("Block No.", "plain")],
        "khata": True,
        "record": "7/12 extract",
        "area_units": ["acres", "guntha", "hectares"],
    },
    "West Bengal": {
        "high_court": "Calcutta High Court",
        "cities": [("Kolkata", "700", ["Salt Lake", "Ballygunge", "New Town"])],
        "districts": ["Hooghly", "Nadia", "Bardhaman"],
        "survey_formats": [("Dag No.", "plain")],
        "khata": True,
        "record": "Khatian",
        "area_units": ["bigha", "katha", "decimal"],
    },
    "Rajasthan": {
        "high_court": "Rajasthan High Court",
        "cities": [
            ("Jaipur", "302", ["Malviya Nagar", "Vaishali Nagar"]),
            ("Udaipur", "313", ["Hiran Magri", "Fatehpura"]),
        ],
        "districts": ["Jaipur", "Ajmer", "Alwar"],
        "survey_formats": [("Khasra No.", "slash")],
        "khata": True,
        "record": "Jamabandi",
        "area_units": ["bigha", "hectares"],
    },
    "Uttar Pradesh": {
        "high_court": "Allahabad High Court",
        "cities": [
            ("Lucknow", "226", ["Gomti Nagar", "Hazratganj", "Aliganj"]),
            ("Kanpur", "208", ["Kakadeo", "Swaroop Nagar"]),
            ("Noida", "201", ["Sector 62", "Sector 50"]),
        ],
        "districts": ["Barabanki", "Unnao", "Sitapur"],
        "survey_formats": [("Khasra No.", "slash"), ("Gata No.", "plain")],
        "khata": True,
        "record": "Khatauni",
        "area_units": ["bigha", "hectares"],
    },
    "Madhya Pradesh": {
        "high_court": "Madhya Pradesh High Court",
        "cities": [
            ("Bhopal", "462", ["Arera Colony", "M.P. Nagar"]),
            ("Indore", "452", ["Vijay Nagar", "Palasia"]),
        ],
        "districts": ["Sehore", "Dewas", "Ujjain"],
        "survey_formats": [("Khasra No.", "slash"), ("Survey No.", "slash")],
        "khata": False,
        "record": "Khasra-B1",
        "area_units": ["hectares", "acres"],
    },
    "Bihar": {
        "high_court": "Patna High Court",
        "cities": [("Patna", "800", ["Boring Road", "Kankarbagh"])],
        "districts": ["Nalanda", "Vaishali", "Gaya"],
        "survey_formats": [("Plot No.", "plain")],
        "khata": True,
        "record": "Khatiyan",
        "area_units": ["katha", "decimal", "acres"],
    },
    "Kerala": {
        "high_court": "Kerala High Court",
        "cities": [
            ("Kochi", "682", ["Kakkanad", "Edappally"]),
            ("Thiruvananthapuram", "695", ["Pattom", "Kowdiar"]),
        ],
        "districts": ["Thrissur", "Palakkad", "Kottayam"],
        "survey_formats": [("Re-Survey No.", "slash"), ("Survey No.", "slash")],
        "khata": False,
        "record": "Thandaper",
        "area_units": ["cents", "acres"],
    },
    "Punjab": {
        "high_court": "Punjab and Haryana High Court",
        "cities": [
            ("Ludhiana", "141", ["Sarabha Nagar", "Model Town"]),
            ("Amritsar", "143", ["Ranjit Avenue", "Lawrence Road"]),
        ],
        "districts": ["Ludhiana", "Patiala", "Jalandhar"],
        "survey_formats": [("Khasra No.", "slash")],
        "khata": True,
        "record": "Jamabandi",
        "area_units": ["kanal", "marla", "acres"],
    },
}

VILLAGE_SUFFIXES = ["pur", "gaon", "wadi", "halli", "palli", "nagar", "kheda", "garh"]
VILLAGE_ROOTS = ["Ram", "Shiv", "Kesh", "Mohan", "Sundar", "Hari", "Ganga", "Lakshmi", "Bhim", "Dev", "Chandra", "Sita"]


def random_location():
    state = rng.choice(list(STATES))
    info = STATES[state]
    city, pin_prefix, localities = rng.choice(info["cities"])
    return {
        "state": state,
        "city": city,
        "pin": f"{pin_prefix}{rng.randint(1, 99):03d}",
        "locality": rng.choice(localities),
        "high_court": info["high_court"],
        "district": rng.choice(info["districts"]),
        "village": rng.choice(VILLAGE_ROOTS) + rng.choice(VILLAGE_SUFFIXES),
        "taluka": rng.choice(VILLAGE_ROOTS) + rng.choice(["pur", "nagar", "abad"]),
        "info": info,
    }


def random_property_address(loc) -> str:
    kind = rng.random()
    if kind < 0.55:
        building = f"{rng.choice(VILLAGE_ROOTS)} {rng.choice(['Residency', 'Apartments', 'Heights', 'Enclave', 'Towers', 'Krupa Co-operative Housing Society'])}"
        unit = f"Flat No. {rng.randint(1, 18)}{rng.randint(0, 1)}{rng.randint(1, 8)}"
        return f"{unit}, {building}, {loc['locality']}, {loc['city']} - {loc['pin']}"
    if kind < 0.85:
        return (f"House No. {rng.randint(1, 999)}, {rng.choice(['Lane', 'Road', 'Cross'])} No. {rng.randint(1, 20)}, "
                f"{loc['locality']}, {loc['city']} - {loc['pin']}")
    return f"Plot No. {rng.randint(1, 400)}, {loc['locality']}, {loc['city']}, {loc['state']} - {loc['pin']}"


# --- People and companies ---------------------------------------------------

def random_person():
    gender = rng.choice(["m", "f"])
    if gender == "m":
        first, honorific, relation = fake.first_name_male(), rng.choice(["Mr.", "Shri"]), "S/o"
    else:
        first = fake.first_name_female()
        honorific, relation = rng.choice([("Ms.", "D/o"), ("Mrs.", "W/o"), ("Smt.", "W/o")])
    last = fake.last_name()
    parent = f"{fake.first_name_male()} {last}"
    return {
        "name": f"{first} {last}",
        "honorific": honorific,
        "relation": relation,
        "parent": parent,
        "age": rng.randint(24, 72),
        "pronoun": "his" if gender == "m" else "her",
        "is_company": False,
    }


COMPANY_SECTORS = ["Agro", "Infra", "Warehousing", "Estates", "Farms", "Developers", "Logistics", "Realty"]
COMPANY_SUFFIXES = ["Private Limited", "Pvt. Ltd.", "LLP"]


def random_company():
    signatory = random_person()
    name = f"{fake.last_name()} {rng.choice(COMPANY_SECTORS)} {rng.choice(COMPANY_SUFFIXES)}"
    return {
        "name": name,
        "signatory": signatory,
        "is_company": True,
        "pronoun": "its",
    }


# --- Money ------------------------------------------------------------------

def indian_group(n: int) -> str:
    s = str(n)
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return ",".join(groups + [tail])


_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
         "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _below_hundred(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return (_TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else "")).strip()


def amount_in_words(n: int) -> str:
    """Indian-system words: 890000 -> 'Eight Lakh Ninety Thousand'."""
    parts = []
    for div, name in ((10_000_000, "Crore"), (100_000, "Lakh"), (1000, "Thousand"), (100, "Hundred")):
        if n >= div:
            parts.append(f"{_below_hundred(n // div) if div != 10_000_000 else amount_in_words(n // div)} {name}")
            n %= div
    if n:
        parts.append(_below_hundred(n))
    return " ".join(parts) or "Zero"


# (labeled span template, trailing unlabeled suffix). The labeled span is
# the currency marker + figure; "/-" and amount-in-words stay outside it.
CURRENCY_STYLES = [
    ("₹{ind}", ""),
    ("₹{ind}", "/-"),
    ("₹ {ind}", "/-"),
    ("Rs. {ind}", "/-"),
    ("Rs.{ind}", "/-"),
    ("INR {ind}", ""),
    ("₹{intl}", ""),  # the v1 format, kept so v1-trained extractors still see it
]


def pick_currency_style():
    return rng.choice(CURRENCY_STYLES)


def format_amount(n: int, style) -> tuple[str, str]:
    span_tpl, suffix = style
    span = span_tpl.format(ind=indian_group(n), intl=f"{n:,}")
    if rng.random() < 0.4:
        suffix = f"{suffix} (Rupees {amount_in_words(n)} only)"
    return span, suffix


def random_monthly_rent(city: str) -> int:
    metro = city in {"Mumbai", "New Delhi", "Bengaluru", "Thane", "Pune", "Hyderabad", "Chennai", "Kolkata", "Noida"}
    low, high = (15000, 120000) if metro else (6000, 40000)
    return rng.randrange(low, high, 500)


# --- Durations, dates, numbers ---------------------------------------------

NUMBER_WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 9: "nine", 10: "ten",
                11: "eleven", 12: "twelve", 15: "fifteen", 20: "twenty", 24: "twenty-four", 25: "twenty-five",
                30: "thirty", 33: "thirty-three", 36: "thirty-six", 45: "forty-five", 60: "sixty", 90: "ninety"}


def format_count(n: int, unit: str) -> str:
    """'11 months' / 'eleven (11) months' / '11 (eleven) months'."""
    plural = unit if n == 1 else unit + "s"
    word = NUMBER_WORDS.get(n)
    r = rng.random()
    if word and r < 0.2:
        return f"{word} ({n}) {plural}"
    if word and r < 0.35:
        return f"{n} ({word}) {plural}"
    return f"{n} {plural}"


MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December"]


def ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def random_date() -> tuple[int, int, int]:
    return rng.randint(1, 28), rng.randint(1, 12), rng.randint(2022, 2026)


DATE_STYLES = 5


def format_date(d: int, m: int, y: int, style: int) -> str:
    """One style per document (real deeds don't mix date formats)."""
    return [
        f"{ordinal(d)} day of {MONTHS[m - 1]}, {y}",
        f"{ordinal(d)} {MONTHS[m - 1]} {y}",
        f"{MONTHS[m - 1]} {d}, {y}",
        f"{d:02d}/{m:02d}/{y}",
        f"{d:02d}.{m:02d}.{y}",
    ][style]


def random_survey_number(kind: str) -> str:
    base = rng.randint(1, 999)
    if kind == "plain":
        return str(base)
    return f"{base}/{rng.choice(['A', 'B', '1', '2', '3', '1A', '2B', '4/1'])}"


def random_land_area(unit: str) -> str:
    if unit in ("acres", "hectares"):
        value = round(rng.uniform(0.5, 12), 2)
    elif unit in ("guntha", "guntas"):
        value = rng.randint(5, 39)
    elif unit in ("cents", "decimal"):
        value = rng.randint(10, 250)
    elif unit in ("bigha", "kanal"):
        value = rng.randint(1, 40)
    elif unit in ("katha", "marla"):
        value = rng.randint(2, 19)
    else:  # sq. yards
        value = rng.randint(200, 5000)
    return f"{value} {unit}"
