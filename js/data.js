// ============================================================
// data.js — Default task seed data
// Only used on first load (when Firestore collection is empty)
// ============================================================

export const DEFAULT_TASKS = [
  // === PRIORITY 1: WEBSITE & INTELLIKID ===
  { id: "1", title: "Website audit — identify all broken links, outdated info, visual issues", status: "critical", site: "all", category: "Website & Digital", priority: "1", notes: "TODAY (Thu): Write everything down before touching anything. Cover: broken links, outdated info, missing sections, visual issues. Do this before any edits.", deps: "Must complete before any Friday edits" },
  { id: "2", title: "Identify IntelliKid embed/link locations on site", status: "critical", site: "all", category: "Website & Digital", priority: "1", notes: "TODAY (Thu): Map exactly where IntelliKid needs to appear — enrollment form, tour scheduling, etc. Define embed method vs. link.", deps: "Website audit (ID 1)" },
  { id: "3", title: "Execute all website edits from audit", status: "inprogress", site: "all", category: "Website & Digital", priority: "1", notes: "Friday: Apply all fixes identified in audit. Fix copy, images, links, navigation.", deps: "Website audit complete (ID 1)" },
  { id: "4", title: "Embed / link IntelliKid CRM on relevant pages", status: "inprogress", site: "all", category: "Website & Digital", priority: "1", notes: "Friday: Embed on enrollment form page and tour scheduling. Test the connection end-to-end.", deps: "IntelliKid location mapping (ID 2)" },
  { id: "5", title: "Full parent enrollment flow test (end-to-end)", status: "inprogress", site: "all", category: "Website & Digital", priority: "1", notes: "Friday: Walk through entire flow as if you are a new parent — find the site, fill out form, schedule tour. Note any friction.", deps: "Website edits + IntelliKid embed done (IDs 3,4)" },
  { id: "6", title: "Soft test — send to Kathe/Molly for review", status: "inprogress", site: "all", category: "Website & Digital", priority: "1", notes: "Saturday: 1-2 trusted people click through and report anything missed.", deps: "End-to-end test passed (ID 5)" },
  { id: "7", title: "Go live — begin sharing website", status: "inprogress", site: "all", category: "Website & Digital", priority: "1", notes: "Sunday: Final fixes applied, site live, begin promoting.", deps: "Soft test sign-off (ID 6)" },
  { id: "8", title: "Summer Camp landing page", status: "inprogress", site: "all", category: "Website & Digital", priority: "1", notes: "Parents searching 'summer camp charlottesville' need to find us. Build or update landing page with themes, dates, pricing, CTA.", deps: "Website go-live (ID 7)" },

  // === PRIORITY 2: SUMMER MARKETING & ENROLLMENT ===
  { id: "9", title: "Email blast — \"Now Enrolling for Summer & Fall\"", status: "inprogress", site: "all", category: "Marketing & Enrollment", priority: "2", notes: "Send to prospective + former families. Former families: filter rising K/1st/2nd for Summer Camp. Include tour link (IntelliKid). Target: send Monday.", deps: "Website live (ID 7); IntelliKid linked (ID 4)" },
  { id: "10", title: "Social media content calendar — 5-7 posts", status: "inprogress", site: "all", category: "Marketing & Enrollment", priority: "2", notes: "Content: carousel post, testimonial, summer vibes/themes, \"Now Enrolling\" CTA, teacher spotlight. Schedule for the week. Ready to go Monday.", deps: "" },
  { id: "11", title: "CRM corporate outreach — filter by parent employer", status: "inprogress", site: "all", category: "Marketing & Enrollment", priority: "2", notes: "Filter CRM by where parents work. Send targeted corporate letters/emails. Good ROI channel.", deps: "Email blast done (ID 9)" },
  { id: "12", title: "Physical marketing — yard signs & banners at all 3 sites", status: "inprogress", site: "all", category: "Marketing & Enrollment", priority: "2", notes: "\"Now Enrolling\" signage at Crozet, Forest Lakes, Mill Creek. Check existing inventory first.", deps: "" },
  { id: "13", title: "Flyers — real estate offices, pools, elementary schools, community boards", status: "inprogress", site: "all", category: "Marketing & Enrollment", priority: "2", notes: "Physical distribution across Charlottesville area. Prioritize: elementary schools (K feeders), community pools, neighborhood boards.", deps: "" },
  { id: "14", title: "Schedule Open Houses at all 3 sites", status: "inprogress", site: "all", category: "Marketing & Enrollment", priority: "2", notes: "Monday format works well historically. Schedule for coming weeks and add to website + social.", deps: "Website live (ID 7)" },
  { id: "15", title: "Referral campaign — current families", status: "inprogress", site: "all", category: "Marketing & Enrollment", priority: "2", notes: "Give flyers + incentive offer (e.g. \"bring a friend — 2 weeks free tuition oldest child\"). Ask in person and via Tadpoles.", deps: "" },
  { id: "16", title: "Call former families directly", status: "inprogress", site: "all", category: "Marketing & Enrollment", priority: "2", notes: "Personal outreach to families who left in last 2 years. High conversion rate. Prioritize families with kids entering summer camp age range.", deps: "" },
  { id: "17", title: "Hiring flyers — create and distribute", status: "inprogress", site: "all", category: "Marketing & Enrollment", priority: "", notes: "STARTED. Create hiring flyers for all 3 sites. Post to job boards, colleges (UVA, Sweet Briar, Mary Baldwin, JMU, Radford, Longwood), social media.", deps: "" },
  { id: "18", title: "Enrollment flyers — create and distribute", status: "inprogress", site: "all", category: "Marketing & Enrollment", priority: "", notes: "STARTED. Companion to hiring flyers. Outdoor brochure holders at all sites. Ask current families to take to their workplace.", deps: "" },

  // === PLAYGROUND PROJECTS ===
  { id: "19", title: "Teacher prep/training doc — monthly curriculum & lesson planning", status: "inprogress", site: "all", category: "Playground Projects", priority: "", notes: "Create structured guide for teachers on how to prepare curriculum and lesson plans for the following month. Standardize across all 3 sites.", deps: "" },

  // === LEGAL / INCIDENT ===
  { id: "20", title: "Crozet incident — law enforcement, CPS & licensing", status: "critical", site: "cr", category: "Legal / Incident", priority: "", notes: "Robin in non-child-facing role. Officer E. Ketchum (Albemarle Co. PD), CPS, and licensing inspector Michelle all engaged. Attorney reviewed — wait for parents to initiate. Do not reach out proactively.", deps: "Attorney sign-off before any parent outreach" },
  { id: "21", title: "Monitor parent & social media — Crozet incident", status: "monitoring", site: "cr", category: "Legal / Incident", priority: "", notes: "Re-engage counsel if negative activity detected online or in parent community. Document everything.", deps: "Crozet incident (ID 20)" },

  // === TRAINING AND PROFESSIONAL DEVELOPMENT ===
  { id: "22", title: "Crozet Director — fill vacancy", status: "critical", site: "cr", category: "Training and Professional Development", priority: "", notes: "Kathe + Alicia interim. Lillie (CR Monkeys lead) and Kimberly S (MC Giraffes) being considered. External hire may be needed. CRITICAL — 2 of 3 sites without permanent director.", deps: "Staffing hole assessment; legal review of offer letter" },
  { id: "25", title: "Laura Baker transition to Mill Creek", status: "monitoring", site: "mc", category: "Training and Professional Development", priority: "", notes: "Confirmed. Relocated from Forest Lakes effective Feb 23. Nancy (Training Coord.) supporting.", deps: "" },
  { id: "26", title: "Jess Rybak onboarding as FL Director", status: "monitoring", site: "fl", category: "Training and Professional Development", priority: "", notes: "Promoted from Cheetahs lead. Sarah Mayers continuing as Zebras lead + AD support.", deps: "Laura Baker MC transition (ID 25)" },

  // === HIRING & ONBOARDING ===
  { id: "23", title: "Crozet Zebras — hire 2nd teacher", status: "critical", site: "cr", category: "Hiring & Onboarding", priority: "", notes: "14 children / 1 teacher. 3 over waiver cap of 11. Cannot resolve via move-ups.", deps: "Crozet Director hire (ID 22)" },
  { id: "27", title: "FL Zebras — fill teacher vacancy", status: "critical", site: "fl", category: "Hiring & Onboarding", priority: "", notes: "Sarah vacated to AD role. 9 children need a teacher. No confirmed replacement.", deps: "Jess Rybak stable (ID 26)" },
  { id: "28", title: "MC Elephants — fill teacher vacancy", status: "critical", site: "mc", category: "Hiring & Onboarding", priority: "", notes: "Jessica moving to admin/front desk (planned March). 9 children need a replacement.", deps: "Jessica transition timeline confirmed" },

  // === ENROLLMENT / MOVE-UPS ===
  { id: "24", title: "Crozet Tigers → Cheetahs move-ups", status: "inprogress", site: "cr", category: "Enrollment / Move-ups", priority: "", notes: "13 children / 1 teacher (Robin). 2 over cap. SIPE + Hamilton are oldest candidates. Cheetahs has 4 open spots.", deps: "Robin situation resolved (ID 20)" },
  { id: "29", title: "MC Giraffes → Alligators move-ups", status: "inprogress", site: "mc", category: "Enrollment / Move-ups", priority: "", notes: "Priority 1 across all sites. Workman/Monteith/Brown are 17–18mo, past 15mo max. Must move Guan + 2 to Monkeys first to open Alligators spots.", deps: "Alligators has 3 open spots; Guan + 2 moved to Monkeys first" },

  // === OPERATIONS / TECH ===
  { id: "30", title: "HR system evaluation", status: "inprogress", site: "all", category: "Operations / Tech", priority: "", notes: "Phased: childcare platform first (Brightwheel, iCare, Playground), then general HR (BambooHR, GoCo) once leadership stable.", deps: "Leadership stability across sites" },
  { id: "31", title: "OliLearn training app — next build phase", status: "inprogress", site: "all", category: "Operations / Tech", priority: "", notes: "olilearn.netlify.app live. Next: persistent backend, real staff in admin panel, more modules, custom domain (training.brightbeginnings.com). GitHub: robhichens/learning.", deps: "Backend architecture decision; domain purchase" },

  // === LEGAL / HR ===
  { id: "32", title: "Staff contract legal review", status: "inprogress", site: "all", category: "Legal / HR", priority: "", notes: "Minimum wage reduction clause for resignations without notice likely violates VA Code §40.1-29(D). Attorney review pending.", deps: "Attorney availability" },

  // === HR / BENEFITS ===
  { id: "33", title: "Kim S childcare subsidy — 100% coverage request", status: "inprogress", site: "mc", category: "HR / Benefits", priority: "", notes: "MC Giraffes only teacher — cannot move her until replacement in place.", deps: "Giraffes teacher backfill" },
  { id: "34", title: "Reagan childcare subsidy — 50% coverage request", status: "inprogress", site: "mc", category: "HR / Benefits", priority: "", notes: "Monkeys teacher. Evaluate and respond.", deps: "" },
];
