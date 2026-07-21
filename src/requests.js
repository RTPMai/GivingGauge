/**
 * GivingGauge — request queue.
 *
 * Each entry pairs the parsed form (`request`) with the Apparelytics facts
 * (`account`). In production the form comes from the Jotform webhook and the
 * account block comes from find_customers + get_customer_summary +
 * customer_reorder_cadence. Here they are inline so the app runs standalone.
 *
 * The three real cases are marked. The rest exercise the edge paths.
 */

const REQUESTS = [
  {
    id: 'REQ-014',
    received: '2026-07-19',
    status: 'pending',
    request: {
      orgName: 'Ankeny Miracle League',
      contactName: 'Dana Whitmer',
      email: 'dana@ankenymiracleleague.org',
      phone: '515-555-0142',
      eventName: 'Fall Opening Day',
      city: 'Ankeny', state: 'IA', county: 'Polk',
      eventDate: '2026-09-26',
      selfReportedCustomer: 'not sure',
      taxStatus: 'exempt',
      missionFit: 'core',
      logoRequired: true,
      attendance: 450,
      yearsActive: 7,
      pieceCount: 60,
      purchaseIntent: 'specific',
      merchandise: 'Short-sleeve tees for players and buddies',
      description: 'Adaptive baseball league for children with disabilities. Opening day brings players, buddy volunteers and families to the Ankeny complex.',
      carriesPMMark: true
    },
    account: {
      found: true, matchConfidence: 'Confirmed', customerId: 'C-3310',
      tier: 'Silver', score: 3, owner: 'Abby',
      lifetimeRevenue: 27400, orderCount: 11,
      medianGapDays: 84, daysSinceLastOrder: 61,
      ytdRevenue: 9200, priorYtdRevenue: 7100,
      firstOrder: '2021-04-02'
    }
  },

  {
    id: 'REQ-013',
    received: '2026-07-18',
    status: 'pending',
    request: {
      orgName: 'Saylorville Trail Run',
      contactName: 'Marcus Bell',
      email: 'marcus@saylorvilletrailrun.com',
      phone: '515-555-0198',
      eventName: 'Saylorville Half Marathon',
      city: 'Polk City', state: 'IA', county: 'Polk',
      eventDate: '2026-10-17',
      selfReportedCustomer: 'yes',
      taxStatus: 'business',
      missionFit: 'civic',
      logoRequired: false,
      attendance: 900,
      yearsActive: 4,
      pieceCount: 180,
      multipleTypes: true,
      purchaseIntent: 'no',
      merchandise: 'Finisher tees and hooded sweatshirts',
      description: 'Ticketed trail half marathon around the reservoir. Organizer operates as an LLC.'
    },
    account: { found: false }
  },

  {
    id: 'REQ-012',
    received: '2026-07-16',
    status: 'pending',
    request: {
      orgName: 'Johnston Dragons Wrestling Club',
      contactName: 'Trent Kolar',
      email: 'tkolar@johnstonwrestling.org',
      phone: '515-555-0177',
      eventName: 'Youth Duals Tournament',
      city: 'Johnston', state: 'IA', county: 'Polk',
      eventDate: '2026-11-14',
      selfReportedCustomer: 'yes',
      taxStatus: 'exempt',
      missionFit: 'adjacent',
      logoRequired: true,
      attendance: 1600,
      yearsActive: 9,
      pieceCount: 70,
      purchaseIntent: 'vague',
      merchandise: 'Singlet warm-up shirts for the host team',
      description: 'Regional youth wrestling duals drawing clubs from across central Iowa. Host club has run the event since 2017.'
    },
    account: {
      found: true, matchConfidence: 'Confirmed', customerId: 'C-1042',
      tier: 'Gold', score: 4, owner: 'Abby',
      lifetimeRevenue: 51800, orderCount: 19,
      medianGapDays: 96, daysSinceLastOrder: 623,
      ytdRevenue: 0, priorYtdRevenue: 8400,
      firstOrder: '2018-09-11'
    }
  },

  /* ---- real case: approved with conditions ---- */
  {
    id: 'REQ-011',
    received: '2026-07-10',
    status: 'approved',
    decidedBy: 'Ryan',
    override: true,
    note: 'Volunteer shirts contingent on the paid tournament shirt order.',
    request: {
      orgName: 'Polk County Pickleball',
      contactName: 'Ethan Welch',
      email: 'ethan@polkcountypickleball.org',
      phone: '515-555-0121',
      eventName: 'Fall Open',
      city: 'Ankeny', state: 'IA', county: 'Polk',
      eventDate: '2026-09-12',
      selfReportedCustomer: 'no',
      taxStatus: 'exempt',
      missionFit: 'adjacent',
      logoRequired: true,
      attendance: 300,
      yearsActive: 3,
      pieceCount: null,
      purchaseIntent: '',
      merchandise: 'Volunteer shirts',
      description: 'Community pickleball tournament at the Ankeny courts. Submitted on the previous form, before piece count and purchase intent were asked.',
      carriesPMMark: true
    },
    account: { found: false }
  },

  /* ---- real case: declined ---- */
  {
    id: 'REQ-010',
    received: '2026-07-08',
    status: 'declined',
    decidedBy: 'Ryan',
    note: 'Medals impractical at low quantities. Kept the shirt quote conversation open.',
    request: {
      orgName: 'Raising Readers in the Heartland',
      contactName: 'Jill Friestad-Tate',
      email: 'jill@raisingreadersheartland.org',
      phone: '515-555-0163',
      eventName: 'Literacy Fun Run',
      city: 'Ankeny', state: 'IA', county: 'Polk',
      eventDate: '2026-10-03',
      selfReportedCustomer: 'no',
      taxStatus: 'exempt',
      missionFit: 'core',
      logoRequired: false,
      attendance: 120,
      yearsActive: 2,
      pieceCount: 40,
      multipleTypes: true,
      purchaseIntent: 'no',
      merchandise: 'Shirts and finisher medals',
      description: 'Family fun run supporting early childhood literacy programming.'
    },
    account: { found: false }
  },

  /* ---- real case: lead-time floor, overridden ---- */
  {
    id: 'REQ-009',
    received: '2026-07-14',
    status: 'approved',
    decidedBy: 'Ryan',
    override: true,
    note: '20% off list with online store ordering. Routed to Abby.',
    request: {
      orgName: 'Lutheran Services in Iowa',
      contactName: 'Shay Olthoff',
      email: 'solthoff@lsiowa.org',
      phone: '515-555-0155',
      eventName: 'Foster Care Appreciation Picnic',
      city: 'Des Moines', state: 'IA', county: 'Polk',
      eventDate: '2026-07-31',
      selfReportedCustomer: 'not sure',
      taxStatus: 'exempt',
      orgType: 'religious',
      isReligious: true,
      askIsSecular: true,
      missionFit: 'core',
      logoRequired: true,
      attendance: 200,
      yearsActive: 4,
      pieceCount: 50,
      purchaseIntent: 'vague',
      merchandise: 'Shirts for foster families and staff',
      description: 'Annual appreciation picnic for foster families. Ask is secular; the org is faith-affiliated social services.'
    },
    account: { found: false }
  }
];

if (typeof window !== 'undefined') window.REQUESTS = REQUESTS;
if (typeof module !== 'undefined' && module.exports) module.exports = REQUESTS;
