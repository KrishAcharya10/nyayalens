# Held-out documents for Anomaly Benchmark v2. Written AFTER the detection fixes were made and run
# exactly once for the first reported numbers, so unlike the main set they were not used to tune any
# rule. Text only; the answer key is heldout/ground_truth.json. All names and figures are invented.
# (Executed by build_fixtures.py heldout; DOCS and BANNER come from there.)

DOCS["H1_rental"] = """# TENANCY AGREEMENT
{banner}

THIS AGREEMENT is made on 14 April 2027 between Mr. Harsh Vardhan Rao, 6 Cathedral Road, Chennai ("the Landlord") and Ms. Pooja Subramanian, 41 Greams Lane, Chennai ("the Tenant").

1. The Flat
The Landlord gives on rent to the Tenant the third-floor flat at 9 Kodambakkam High Road, Chennai 600024, for residence only.

2. Period of Tenancy
The tenancy is for a period of 12 months, starting on 1 May 2027 and ending on 31 March 2028.

3. Monthly Rent
The Tenant pays Rs. 18,000/- per month, on or before the 10th of every month.

4. Advance Deposit
The Tenant has paid a refundable deposit of Rs. 54,000/- to the Landlord. It is repaid within 20 days after the Tenant leaves and hands over the keys, after deducting only proved dues.

5. Revision
The monthly rent payable by the Tenant shall be Rs. 20,000/- throughout the tenancy.

6. Ending the Tenancy
Either party may end the tenancy by giving the other 2 months written notice.

7. Governing Courts
Disputes are subject to the jurisdiction of the courts at Chennai.
"""

DOCS["H2_offer_letter"] = """{banner}

Date: 2 June 2027

To,
Mr. Rohit Banerjee

OFFER OF APPOINTMENT

Strata Insights Pvt. Ltd., Salt Lake, Kolkata (the "Employer") offers Mr. Rohit Banerjee (the "Employee") the position of Data Scientist.

Joining: You will join us on 5 July 2027.

Pay: Your annual cost to the Employer (CTC) is INR 9,60,000. This consists of a basic salary of INR 40,000 per month, house rent allowance of INR 20,000 per month and a special allowance of INR 25,000 per month.

Probation: You will be on probation for 6 months from the joining date.

General: Your probation period will be 3 months, after which you will be confirmed in writing. Either party may end the employment after confirmation on 30 days written notice.

Please countersign this letter to accept.
"""

DOCS["H3_service_agreement"] = """# AGREEMENT FOR PROFESSIONAL SERVICES
{banner}

This Agreement is made on 11 August 2027 between Lotus Retail Pvt. Ltd., Ahmedabad (the "Client") and Kinetic Analytics LLP, Pune (the "Service Provider").

ARTICLE I - SERVICES
The Service Provider shall build and maintain a customer analytics platform for the Client.

ARTICLE II - FEES
The Client shall pay the Service Provider a fee of INR 14,00,000 for the platform.

ARTICLE III - INVOICING AND PAYMENT
Invoices shall be paid within 21 days of receipt of the invoice.

ARTICLE IV - ADDITIONAL PAYMENT TERMS
The Client shall settle each invoice within 40 days of the date of the invoice.

ARTICLE V - LIABILITY
The aggregate liability of the Service Provider under this Agreement shall not exceed INR 10,00,000. The indemnity given by the Service Provider for infringement of third-party rights is not subject to any cap.

ARTICLE VI - TERMINATION
Either party may terminate this Agreement on 45 days written notice.

ARTICLE VII - JURISDICTION
The courts at Ahmedabad have exclusive jurisdiction.
"""

DOCS["H4_agreement_to_sell"] = """# AGREEMENT TO SELL
{banner}

Dated 3 September 2027.

Between Mr. Nitin Chauhan of 15 Civil Lines, Lucknow (the "Seller") and Mrs. Anjali Verma of 28 Gomti Nagar, Lucknow (the "Buyer").

1. Property
The Seller agrees to sell Flat 12B in Gomti Heights, Vibhuti Khand, Lucknow 226010, with a built-up area of 1,200 sq. ft.

2. Price and Payment
The total price is INR 55,00,000. The Buyer has paid INR 5,50,000 as advance on signing. The balance of INR 49,50,000 is payable on registration of the sale deed, on or before 30 November 2027.

3. Possession
The Seller shall deliver vacant possession of Flat 12B on 5 December 2027.

4. Title
The Seller declares that the flat is free from any mortgage, charge or litigation.

5. Default
If the Buyer fails to pay the balance in time, the Seller may cancel this Agreement after 15 days written notice and refund the advance without interest.

6. Courts
The courts at Lucknow have jurisdiction.
"""

DOCS["H5_msa"] = """# MASTER SERVICES AGREEMENT
{banner}

This Master Services Agreement is made on 20 September 2027 between Orion Pharma Pvt. Ltd., Hyderabad (the "Customer") and Delta Data Systems Pvt. Ltd., Bengaluru (the "Supplier").

1. Services
The Supplier shall provide data-management services under statements of work signed by both parties.

2. Fees
The monthly fee under the first statement of work is INR 4,00,000.

3. Payment
The Customer shall pay each undisputed invoice within 30 days of receipt.

4. Confidentiality
Each party shall keep the other's confidential information secret during the term and for 5 years afterwards.

5. Liability
The Supplier's aggregate liability shall not exceed INR 25,00,000. Nothing in this clause limits liability for fraud or wilful misconduct.

6. Term and Termination
This Agreement continues for 3 years. Either party may terminate it on 60 days written notice.

7. Jurisdiction
The courts at Hyderabad have exclusive jurisdiction.
"""

DOCS["H6_nda"] = """# NON-DISCLOSURE AGREEMENT
{banner}

This Agreement is made on 7 October 2027 between Vega Semiconductors Pvt. Ltd., Chennai (the "Disclosing Party") and Ms. Ritika Sood of 12 Sector 15, Chandigarh (the "Receiving Party").

1. Purpose
The Disclosing Party will share confidential information with the Receiving Party only to evaluate a design-licensing arrangement.

2. Definition
"Confidential Information" means all non-public technical and commercial information the Disclosing Party discloses in any form.

3. Duties
The Receiving Party shall keep the Confidential Information secret and use it only for the stated purpose.

4. Exclusions
These duties do not cover information that is public, already known to the Receiving Party, or independently developed.

5. Duration
The Receiving Party's confidentiality obligations continue for 5 years from the date of this Agreement.

6. Return
Within 15 days of a written request, the Receiving Party shall return or destroy all Confidential Information.

7. Jurisdiction
The courts at Chennai have exclusive jurisdiction.
"""
