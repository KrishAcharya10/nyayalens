"""
Value pools for synthetic Indian legal document generation.
All values here are randomly combined per-document, so exact offsets
are known at generation time -- no post-hoc entity detection needed.
"""
import random

from faker import Faker

fake = Faker("en_IN")

INDIAN_CITIES = [
    "Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Bengaluru", "Delhi",
    "Chennai", "Hyderabad", "Ahmedabad", "Kolkata", "Jaipur", "Lucknow",
    "Indore", "Surat", "Kanpur", "Bhopal", "Patna", "Vadodara", "Nagercoil",
]

STATES = [
    "Maharashtra", "Karnataka", "Delhi", "Tamil Nadu", "Telangana",
    "Gujarat", "West Bengal", "Rajasthan", "Uttar Pradesh", "Madhya Pradesh",
    "Bihar",
]

COURTS_BY_STATE = {
    "Maharashtra": "Bombay High Court",
    "Karnataka": "Karnataka High Court",
    "Delhi": "Delhi High Court",
    "Tamil Nadu": "Madras High Court",
    "Telangana": "Telangana High Court",
    "Gujarat": "Gujarat High Court",
    "West Bengal": "Calcutta High Court",
    "Rajasthan": "Rajasthan High Court",
    "Uttar Pradesh": "Allahabad High Court",
    "Madhya Pradesh": "Madhya Pradesh High Court",
    "Bihar": "Patna High Court",
}

NOTICE_PERIODS_DAYS = [15, 30, 45, 60, 90]
LEASE_DURATIONS_MONTHS = [11, 12, 24, 36, 60]

LAND_USE_TYPES = ["Agricultural", "Non-Agricultural (NA)", "Residential Conversion Pending", "Commercial"]
LAND_AREA_UNITS = ["acres", "guntha", "hectares", "sq. ft."]

PERMITTED_USES_LAND = [
    "cultivation of seasonal crops",
    "horticultural plantation",
    "construction of a warehouse facility",
    "agricultural storage purposes",
    "dairy farming operations",
]

RENT_PAYMENT_PHRASINGS = [
    "The Lessee/Tenant shall pay a monthly rent of {rent} to the Lessor/Landlord on or before the {due_day} day of each calendar month.",
    "Monthly rent payable under this Agreement shall be {rent}, due on or before the {due_day} of every month, payable via bank transfer.",
    "The Tenant agrees to remit a sum of {rent} per month towards rent, such payment to be made no later than the {due_day} of each month.",
    "Rent for the demised premises is fixed at {rent} per calendar month, payable in advance by the {due_day} of the month.",
]

SECURITY_DEPOSIT_PHRASINGS = [
    "The Tenant shall pay an interest-free refundable security deposit of {deposit} to the Landlord prior to taking possession.",
    "A sum of {deposit} shall be deposited by the Lessee with the Lessor as security, refundable upon vacation subject to deductions for damages.",
    "Security deposit of {deposit} shall be paid at the time of execution of this Agreement and refunded within 30 days of vacating the premises.",
]

NOTICE_PERIOD_PHRASINGS = [
    "Either party may terminate this Agreement by giving {notice_days}' written notice to the other party.",
    "This Agreement may be terminated by either party upon serving a notice period of {notice_days} in writing.",
    "A notice of {notice_days} shall be required from either party intending to terminate this tenancy.",
]

LEASE_PREMIUM_PHRASINGS = [
    "The Lessee shall pay a one-time lease premium of {premium} to the Lessor upon execution of this Deed.",
    "An upfront lease premium amounting to {premium} shall be payable by the Lessee prior to handover of possession of the land.",
]

LAND_ANNUAL_RENT_PHRASINGS = [
    "In addition to the lease premium, the Lessee shall pay an annual lease rent of {rent} payable on or before {due_month} each year.",
    "Annual rent of {rent} for the leased land shall be paid by the Lessee to the Lessor on or before {due_month} of every calendar year.",
]

ENCUMBRANCE_PHRASINGS = [
    "The Lessor hereby declares that the said land bearing Survey No. {survey_no} is free from all encumbrances, charges, and liens.",
    "The Lessor confirms that the land described herein, Survey No. {survey_no}, is unencumbered and free from any third-party claims.",
]

LAND_USE_RESTRICTION_PHRASINGS = [
    "The Lessee shall use the leased land solely for the purpose of {permitted_use} and for no other purpose without prior written consent.",
    "The land hereby leased shall be utilised exclusively for {permitted_use}; any change in use shall require the Lessor's written approval.",
]

MAINTENANCE_PHRASINGS = [
    "The Tenant shall be responsible for routine maintenance of the premises, while structural repairs shall be borne by the Landlord.",
    "Day-to-day upkeep of the premises shall be the responsibility of the Tenant; major structural repairs shall be undertaken by the Landlord.",
]

TERMINATION_PHRASINGS = [
    "The Landlord may terminate this Agreement forthwith in the event of non-payment of rent for two consecutive months.",
    "In case of breach of any material term of this Agreement, the aggrieved party may terminate the Agreement after serving due notice.",
]

DISPUTE_RESOLUTION_PHRASINGS = [
    "Any dispute arising out of this Agreement shall be referred to arbitration under the Arbitration and Conciliation Act, 1996.",
    "All disputes shall first be attempted to be resolved amicably, failing which the matter shall be subject to arbitration in {city}.",
]

JURISDICTION_PHRASINGS = [
    "This Agreement shall be governed by the laws of India, and courts at {city} alone shall have jurisdiction.",
    "The courts at {city} shall have exclusive jurisdiction over any matter arising from this Agreement.",
]


def random_rent(low=8000, high=80000):
    val = random.randrange(low, high, 500)
    return f"₹{val:,}"


def random_deposit(rent_value_str, multiplier_choices=(2, 3, 6, 10)):
    val = int(rent_value_str.replace("₹", "").replace(",", ""))
    mult = random.choice(multiplier_choices)
    return f"₹{val * mult:,}"


def random_land_area():
    unit = random.choice(LAND_AREA_UNITS)
    if unit == "acres":
        val = round(random.uniform(0.5, 10), 2)
    elif unit == "guntha":
        val = random.randint(5, 40)
    elif unit == "hectares":
        val = round(random.uniform(0.2, 4), 2)
    else:
        val = random.randint(1000, 20000)
    return f"{val} {unit}"


def random_survey_number():
    return f"{random.randint(1, 999)}/{random.choice(['A', 'B', '1', '2', '3'])}"


def random_lease_premium(low=100000, high=5000000):
    val = random.randrange(low, high, 10000)
    return f"₹{val:,}"


def random_person_name():
    return fake.name()


def random_month():
    return random.choice([
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ])
