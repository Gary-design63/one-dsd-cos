const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '../../data/one-dsd.db');
let _db = null;

async function getDb() {
  if (_db) return _db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
    await initSchema(_db);
  }
  return _db;
}

function saveDb() {
  if (!_db) return;
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
  } catch (e) { console.error('DB save error:', e.message); }
}

async function initSchema(db) {
  db.run(`PRAGMA journal_mode=WAL;`);
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      full_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff',
      department TEXT, idi_stage TEXT DEFAULT 'Denial', created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS equity_reviews (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, level TEXT DEFAULT 'scan',
      status TEXT DEFAULT 'in_progress', current_step INTEGER DEFAULT 1,
      step_data TEXT DEFAULT '{}', user_id TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS action_items (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, owner TEXT,
      status TEXT DEFAULT 'not_started', priority TEXT DEFAULT 'normal',
      progress INTEGER DEFAULT 0, due_date TEXT, goal_id TEXT, review_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS consultations (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, department TEXT,
      status TEXT DEFAULT 'open', priority TEXT DEFAULT 'normal',
      requester_id TEXT, assigned_to TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS operational_goals (
      id TEXT PRIMARY KEY, number INTEGER NOT NULL, title TEXT NOT NULL,
      description TEXT, weight INTEGER DEFAULT 15, base_progress INTEGER DEFAULT 0,
      target_date TEXT, status TEXT DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT, description TEXT,
      content TEXT, is_featured INTEGER DEFAULT 0,
      authority_level TEXT DEFAULT 'internal', created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS community_profiles (
      id TEXT PRIMARY KEY, community_name TEXT NOT NULL, category TEXT,
      languages_json TEXT DEFAULT '[]', cultural_context TEXT,
      communication_guidance TEXT, trust_factors TEXT, service_considerations TEXT,
      contacts TEXT, strengths_json TEXT DEFAULT '[]', priority_flag INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS training_courses (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
      format TEXT DEFAULT 'self-paced', level TEXT DEFAULT 'foundational',
      idi_stage TEXT, duration_minutes INTEGER DEFAULT 60, is_required INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS training_progress (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, course_id TEXT NOT NULL,
      progress INTEGER DEFAULT 0, completed_at TEXT, updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS deia_topics (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, definition TEXT, dsd_relevance TEXT,
      frameworks TEXT, discussion_questions TEXT, tags_json TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reflections (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, reflection_text TEXT NOT NULL,
      prompt_id TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS spaced_retrieval_prompts (
      id TEXT PRIMARY KEY, week_number INTEGER, prompt_text TEXT NOT NULL,
      idi_stage TEXT DEFAULT 'Minimization', active INTEGER DEFAULT 1, week_start TEXT
    );
    CREATE TABLE IF NOT EXISTS weekly_syntheses (
      id TEXT PRIMARY KEY, week_start TEXT NOT NULL, synthesis_text TEXT NOT NULL,
      week_number INTEGER, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_definitions (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, autonomy TEXT DEFAULT 'supervised',
      approval_gate TEXT DEFAULT 'mandatory', config_json TEXT DEFAULT '{}',
      is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS learning_loop_proposals (
      id TEXT PRIMARY KEY, trigger_pattern TEXT NOT NULL, suggested_change TEXT,
      lint_score INTEGER DEFAULT 85, status TEXT DEFAULT 'pending',
      proposed_by TEXT, decided_by TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS approval_queue (
      id TEXT PRIMARY KEY, item_type TEXT NOT NULL, item_id TEXT NOT NULL,
      title TEXT NOT NULL, content TEXT, status TEXT DEFAULT 'pending',
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')), decided_at TEXT
    );
    CREATE TABLE IF NOT EXISTS consultant_documents (
      id TEXT PRIMARY KEY, filename TEXT NOT NULL, file_type TEXT,
      classification TEXT DEFAULT 'reference', routing_destination TEXT DEFAULT 'knowledge_base',
      storage_path TEXT, authority_level TEXT DEFAULT 'internal', version TEXT,
      upload_date TEXT, approved INTEGER DEFAULT 0, usage_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL, details TEXT,
      agent_id TEXT, user_id TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS working_groups (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, initiative TEXT,
      status TEXT DEFAULT 'active', findings_summary TEXT, members_json TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS odet_records (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, record_type TEXT,
      status TEXT DEFAULT 'active', notes TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS equity_team (
      id TEXT PRIMARY KEY, full_name TEXT NOT NULL, charter_role TEXT,
      unit TEXT, email TEXT, joined_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS community_feedback (
      id TEXT PRIMARY KEY, feedback_text TEXT NOT NULL, attribution TEXT,
      community_tag TEXT, collection_cycle TEXT, sentiment TEXT DEFAULT 'neutral',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, event_date TEXT,
      event_type TEXT DEFAULT 'equity', description TEXT,
      location TEXT, is_recurring INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS team_activities (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT,
      duration_minutes INTEGER DEFAULT 30, equity_theme TEXT,
      materials TEXT DEFAULT 'None', instructions TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cos_clusters (
      id TEXT PRIMARY KEY, cluster_id TEXT UNIQUE NOT NULL,
      cluster_type TEXT DEFAULT 'primary', color TEXT DEFAULT '#4A9EDB', description TEXT
    );
    CREATE TABLE IF NOT EXISTS cos_atoms (
      id TEXT PRIMARY KEY, atom_id TEXT UNIQUE NOT NULL, cluster_id TEXT,
      function_id TEXT, verb TEXT NOT NULL, object TEXT NOT NULL,
      stakeholder TEXT, mode TEXT, output TEXT, taxonomy TEXT,
      source_statement TEXT, agent_enabled INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS cos_outputs (
      id TEXT PRIMARY KEY, atom_id TEXT, title TEXT NOT NULL, content TEXT NOT NULL,
      status TEXT DEFAULT 'approved', created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cos_approvals (
      id TEXT PRIMARY KEY, atom_id TEXT, atom_name TEXT, output_text TEXT,
      output_type TEXT DEFAULT 'text', status TEXT DEFAULT 'pending',
      revision_notes TEXT, requires_approval INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')), decided_at TEXT
    );
  `);

  await seedData(db);
}

async function seedData(db) {
  // Users
  const pw1 = bcrypt.hashSync('equity2026!', 10);
  const pw2 = bcrypt.hashSync('password123', 10);
  db.run(`INSERT OR IGNORE INTO users VALUES (?,?,?,?,?,?,?,datetime('now'))`,
    ['user-consultant-1','gbanks',pw1,'Gary Banks','equity_lead','Disability Services Division','Adaptation']);
  db.run(`INSERT OR IGNORE INTO users VALUES (?,?,?,?,?,?,?,datetime('now'))`,
    ['user-staff-1','staff1',pw2,'Staff One','staff','DSD Programs','Minimization']);
  db.run(`INSERT OR IGNORE INTO users VALUES (?,?,?,?,?,?,?,datetime('now'))`,
    ['user-staff-2','staff2',pw2,'Staff Two','staff','DSD Operations','Denial']);

  // Operational Goals
  const goals = [
    ['goal-1',1,'Increase Culturally Responsive Service Delivery','Improve CLAS Standard compliance across all DSD programs',20,35,'2026-09-30','active'],
    ['goal-2',2,'Build Staff Equity Competency','IDI-informed training for 80% of DSD staff by Q4',15,42,'2026-12-31','active'],
    ['goal-3',3,'Reduce Service Disparities','Close access gaps for priority populations',20,28,'2026-12-31','active'],
    ['goal-4',4,'Strengthen Community Partnerships','Active partnerships with 10+ community organizations',15,55,'2026-09-30','active'],
    ['goal-5',5,'Operationalize Equity Infrastructure','Embed equity into all DSD business processes',15,60,'2026-06-30','active'],
    ['goal-6',6,'Expand Language Access','Ensure language access for 95% of service interactions',15,70,'2026-12-31','active'],
  ];
  goals.forEach(g => db.run(`INSERT OR IGNORE INTO operational_goals VALUES (?,?,?,?,?,?,?,?)`, g));

  // Consultations
  const consults = [
    ['cons-1','PCA Provider Rate Changes — Equity Impact','How will the proposed rate changes affect providers serving Somali and Hmong communities?','DSD Policy','open','urgent','user-staff-1',null],
    ['cons-2','MnCHOICES Assessment Cultural Adaptation','Tools need cultural adaptation for Indigenous communities in greater MN','DSD Assessment','in_progress','high','user-staff-2','user-consultant-1'],
    ['cons-3','HCBS Waiver Application Barriers','Families are dropping out of the application process — language and navigation barriers','DSD Waivers','open','high','user-staff-1',null],
  ];
  consults.forEach(c => db.run(`INSERT OR IGNORE INTO consultations (id,title,description,department,status,priority,requester_id,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`, c));

  // Action Items
  const actions = [
    ['act-1','Complete IDI Group Profile for DSD Leadership Team','Administer IDI and debrief with senior leadership','gbanks','in_progress','high',65,'2026-04-15','goal-2'],
    ['act-2','Develop Somali Community Resource Guide','Partner with Somali community liaisons to create navigable guide','gbanks','not_started','high',0,'2026-05-01','goal-1'],
    ['act-3','Audit HCBS Waiver Forms for Plain Language','Review all 23 forms for 8th grade reading level','gbanks','in_progress','normal',40,'2026-04-30','goal-3'],
    ['act-4','Establish Hmong Advisory Circle','Recruit 8-10 Hmong community members for quarterly advisory','gbanks','not_started','normal',0,'2026-06-30','goal-4'],
    ['act-5','Create Equity Analysis Toolkit Training','eLearning module for DHS Equity Analysis Toolkit (FARM)','gbanks','in_progress','high',75,'2026-04-01','goal-5'],
    ['act-6','Translate MnCHOICES Outreach Materials','Priority: Somali, Hmong, Spanish, Ojibwe','gbanks','not_started','high',0,'2026-05-15','goal-6'],
  ];
  actions.forEach(a => db.run(`INSERT OR IGNORE INTO action_items (id,title,description,owner,status,priority,progress,due_date,goal_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`, a));

  // Resources
  const resources = [
    ['res-1','DHS Equity Analysis Toolkit (FARM)','equity_toolkit','Fairness, Access, Representation, Multicultural Competency framework','The FARM framework guides equity analysis across DHS programs. Use for policy review, program design, and resource allocation decisions.',1],
    ['res-2','CLAS Standards Reference Guide','clas','National Standards for Culturally and Linguistically Appropriate Services (1-15)','The 15 CLAS Standards cover: Principal Standard (1), Governance Leadership and Workforce (2-4), Communication and Language Assistance (5-8), and Engagement, Continuous Improvement and Accountability (9-15).',1],
    ['res-3','Disability Justice Principles','disability_justice','Ten principles of disability justice from Sins Invalid','The ten principles are: Intersectionality, Leadership of Most Impacted, Anti-Capitalist Politics, Cross-Movement Solidarity, Recognizing Wholeness, Sustainability, Cross-Disability Solidarity, Interdependence, Collective Access, Collective Liberation.',1],
    ['res-4','ADA Title II Compliance Guide','ada','Federal requirements for state and local government disability services','Title II prohibits discrimination against qualified individuals with disabilities in all programs, activities, and services of public entities.',1],
    ['res-5','IDI Assessment Framework','training','Intercultural Development Inventory stages and progression','The IDI measures orientation toward cultural difference along the Intercultural Development Continuum: Denial, Polarization, Minimization, Acceptance, and Adaptation.',0],
    ['res-6','GARE Racial Equity Framework','equity_toolkit','Government Alliance on Race and Equity framework','GARE: Normalize (regular conversations about race), Organize (institutional commitment), Operationalize (implement tools and processes).',0],
    ['res-7','Universal Design for Learning Guide','ada','UDL principles for accessible program design','UDL principles: Multiple Means of Engagement (why), Multiple Means of Representation (what), Multiple Means of Action and Expression (how).',0],
    ['res-8','Cultural Humility Reference','community','Understanding cultural humility in DSD practice',"Cultural humility is a lifelong process of self-reflection and learning that acknowledges the limits of one's knowledge and centers the other person's expertise about their own experience.",0],
  ];
  resources.forEach(r => db.run(`INSERT OR IGNORE INTO resources (id,title,category,description,content,is_featured,authority_level,created_at) VALUES (?,?,?,?,?,?,'internal',datetime('now'))`, r));

  // Community Profiles — Universal coverage, all MN communities, NO priority ranking
  // All 30 profiles are equally important. The program serves ALL communities universally.
  const profiles = [
    // East African Communities
    ['cp-1','Somali Community','East African',JSON.stringify(['Somali','English','Arabic']),
     'Strong oral tradition, clan-based social structure, Islamic faith central to daily life. Large population in Twin Cities, particularly Minneapolis and St. Paul.',
     'Formal introductions matter. Allow time for relationship building. Gender considerations in mixed settings. Written materials less effective than in-person communication.',
     'Trust built through community elders, mosques, and organizations like Somali Community Resettlement Services. Historical mistrust of government due to refugee experiences.'],
    ['cp-2','Ethiopian Community','East African',JSON.stringify(['Amharic','Tigrinya','Oromo','English']),
     'Diverse community with multiple ethnic groups (Oromo, Amhara, Tigrinya). Strong family ties, coffee ceremony as social ritual, Orthodox Christian and Muslim faith traditions.',
     'Do not treat as monolithic — significant ethnic and religious variation. Show respect for elders. In-person relationship building essential before formal services.',
     'Trust through Ethiopian Community of Minnesota and faith communities. Some distrust of government based on country-of-origin experiences.'],
    ['cp-3','Eritrean Community','East African',JSON.stringify(['Tigrinya','Arabic','English']),
     'Closely knit community, strong national identity, Orthodox Christian majority. Many arrived as refugees. Distinct from Ethiopian community despite geographic proximity.',
     'Respect community independence and distinct identity. Avoid conflating with Ethiopian community. Tigrinya is primary language — provide interpretation.',
     'Trust through Eritrean community organizations and Orthodox churches.'],
    ['cp-4','Kenyan Community','East African',JSON.stringify(['Swahili','English']),
     'Educated professional community, strong church connections. Many arrived as students or professionals rather than refugees.',
     'Many are English proficient. Strong connections to churches and professional networks.',
     'Trust through professional networks and churches.'],
    // Southeast Asian Communities
    ['cp-5','Hmong Community','Southeast Asian',JSON.stringify(['Hmong','English']),
     'Clan-based social structure with 18 clans, strong family loyalty, elder respect paramount. Significant presence in Twin Cities and outstate MN. Traditional healing practices alongside Western medicine.',
     'Use trained professional interpreters — never family members. Allow extra time. Written Hmong materials have limited reach — older generations may not be literate in Hmong. Clan structure influences decision-making.',
     'Trust through clan leaders, Hmong American Partnership, and local Hmong organizations. Historical trauma from Secret War and refugee experience.'],
    ['cp-6','Cambodian/Khmer Community','Southeast Asian',JSON.stringify(['Khmer','English']),
     'Buddhist faith central, strong family networks, significant trauma from Khmer Rouge genocide. Many are survivors or children of survivors.',
     'Trauma-informed approach essential. Buddhist practices influence health and healing beliefs. Older generation may have limited literacy.',
     'Trust through Cambodian churches and mutual aid organizations. Significant PTSD and intergenerational trauma.'],
    ['cp-7','Vietnamese Community','Southeast Asian',JSON.stringify(['Vietnamese','English']),
     'Strong family networks, Confucian values of respect and hierarchy, Buddhist and Catholic faith traditions. Long-established community in MN.',
     'Respect for elders and hierarchy in communication. Family involvement in decisions. Strong community organizations.',
     'Trust through Vietnamese Association of Minnesota and faith communities.'],
    ['cp-8','Lao Community','Southeast Asian',JSON.stringify(['Lao','English']),
     'Buddhist traditions, strong community ties, many arrived as refugees from Laos. Often conflated with Hmong but distinct culture.',
     'Distinct from Hmong — different language, culture, religion. Buddhist practices influence service engagement.',
     'Trust through Lao community organizations and Buddhist temples.'],
    // Indigenous Nations
    ['cp-9','Ojibwe (Anishinaabe) Nations','Indigenous',JSON.stringify(['Ojibwe','English']),
     'Seven Ojibwe bands in MN: Bois Forte, Fond du Lac, Grand Portage, Leech Lake, Mille Lacs, Red Lake, White Earth. Sovereign nations with distinct governance, treaties, and cultural practices.',
     'Recognize tribal sovereignty — each band is a government, not a county. Use correct nation names. Allow time for consensus-based decision making. Seven Grandfather Teachings guide values.',
     'Trust through tribal social service departments and tribal councils. Profound historical trauma from boarding schools, forced assimilation, and treaty violations.'],
    ['cp-10','Dakota Nations','Indigenous',JSON.stringify(['Dakota','English']),
     'Four Dakota communities in MN: Upper Sioux, Lower Sioux, Prairie Island, Prior Lake. Deeply connected to Mnisota Makoce (Land Where the Waters Reflect the Skies).',
     'Acknowledge Dakota homelands. Distinct from Ojibwe — different language, history, traditions. Dakota language revitalization is important cultural priority.',
     'Trust through Dakota tribal governments. Deep historical trauma from 1862 Dakota War, mass execution, and forced removal.'],
    ['cp-11','Urban Indigenous Community','Indigenous',JSON.stringify(['English','Ojibwe','Dakota']),
     'Multi-tribal urban community in Twin Cities — one of largest urban Indigenous populations in US. Diverse tribal affiliations, strong pan-Indigenous identity.',
     'Do not assume tribal affiliation. Urban Indigenous people maintain strong cultural identity. American Indian Movement (AIM) historical significance in Twin Cities.',
     'Trust through Little Earth of United Tribes, American Indian Center, and Urban Roots. Unique needs distinct from reservation-based services.'],
    // Latino/a/x Communities
    ['cp-12','Mexican/Mexican-American Community','Latino/a/x',JSON.stringify(['Spanish','English']),
     'Largest Latino group in MN. Significant agricultural worker population in outstate MN. Catholic faith prominent. Familismo — family central to all decisions. Diverse by generation and documentation status.',
     'Spanish language materials essential but vary by literacy level and dialect. Familismo means family involvement in service decisions. Personalismo — relationship before business.',
     'Trust through Catholic churches, Centro Campesino, and Migrant Health programs. Fear of immigration enforcement is a real barrier.'],
    ['cp-13','Puerto Rican Community','Latino/a/x',JSON.stringify(['Spanish','English']),
     'U.S. citizens, strong presence in Twin Cities. Distinct from immigrant Latino communities — different historical relationship with U.S. government.',
     'Recognize distinct identity as U.S. citizens. Cultural pride and political awareness. Spanglish common in younger generations.',
     'Trust through Puerto Rican Cultural Center and community organizations.'],
    ['cp-14','Central American Community','Latino/a/x',JSON.stringify(['Spanish','English']),
     'Guatemalan, Salvadoran, Honduran communities with significant presence in MN. Many fled violence or economic hardship. Indigenous Guatemalan communities speak languages other than Spanish.',
     'Do not assume Spanish as primary language for Guatemalan Mayan communities — Mam, Quiche, and other Indigenous languages may be primary. Significant trauma from war and displacement.',
     'Trust through CLUES (Comunidades Latinas Unidas En Servicio) and legal aid organizations.'],
    // African-American/Black Communities
    ['cp-15','African American Community','African American',JSON.stringify(['English']),
     'Established community with deep roots in MN. Significant disparities in all social determinants of health. Historic redlining and segregation impacts continue. Strong church tradition.',
     'Acknowledge historical and ongoing racial discrimination. Recognize community strengths and assets. Church-based trust networks important.',
     'Trust through NAACP, Urban League, Black community churches, and Northside community organizations. Longstanding distrust of government based on documented discrimination.'],
    ['cp-16','African Immigrant Communities (West/Central Africa)','African',JSON.stringify(['French','English','Various']),
     'Diverse communities from Nigeria, Ghana, Liberia, Democratic Republic of Congo, and other nations. French and English speaking. Many are students and professionals.',
     'Significant diversity — do not treat as monolithic. French may be more comfortable than English for some. Strong national and ethnic identities.',
     'Trust through African immigrant community organizations and faith communities.'],
    // Asian Communities
    ['cp-17','Tibetan Community','Asian',JSON.stringify(['Tibetan','English']),
     'Small but established community in Twin Cities. Buddhist faith central, strong cultural preservation focus. Many arrived as refugees.',
     'Buddhist practices central to community life. Strong focus on cultural preservation and Tibetan language.',
     'Trust through Tibetan community organizations and Buddhist centers.'],
    ['cp-18','Bhutanese/Nepali Community','Asian',JSON.stringify(['Nepali','Dzongkha','English']),
     'Growing refugee community in MN. Bhutanese of Nepali origin expelled from Bhutan. Multiple ethnicities and religions within community.',
     'Nepali is primary language. Complex history of statelessness. Community is still establishing itself in MN.',
     'Trust through refugee resettlement organizations and emerging community groups.'],
    ['cp-19','Chinese Community','Asian',JSON.stringify(['Mandarin','Cantonese','English']),
     'Diverse community spanning multiple generations, immigration statuses, and Chinese dialects. Students, professionals, and long-term residents.',
     'Mandarin vs. Cantonese distinction matters. Generational differences are significant. Traditional Chinese medicine influences health decisions.',
     'Trust through Chinese community associations and cultural organizations.'],
    ['cp-20','Korean Community','Asian',JSON.stringify(['Korean','English']),
     'Established community with strong church networks. High educational attainment. Significant generational differences in acculturation.',
     'Korean churches are central community hubs. Respect for hierarchy and elders. Mental health stigma can be a barrier.',
     'Trust through Korean community churches and cultural organizations.'],
    // Other Communities
    ['cp-21','Karen/Karenni Community','Southeast Asian',JSON.stringify(['Karen','Burmese','English']),
     'Largest Burmese refugee group in MN, particularly St. Paul. Fled ethnic persecution in Myanmar/Burma. Christian majority (Baptist).',
     'Karen is primary language — distinct from Burmese. Baptist churches are central community institutions. Significant trauma from persecution.',
     'Trust through Karen churches and Burmese Community Association of Minnesota.'],
    ['cp-22','Burmese/Myanmar Community','Southeast Asian',JSON.stringify(['Burmese','English']),
     'Multiple ethnic groups from Myanmar — Burman, Shan, Kachin, Mon. Buddhist majority. Many fled political persecution.',
     'Significant ethnic diversity within Myanmar community. Buddhist practices influence health and social decisions.',
     'Trust through Myanmar community organizations and Buddhist temples.'],
    ['cp-23','Oromo/Ethiopian Muslim Community','East African',JSON.stringify(['Oromo','Amharic','English']),
     'Distinct from Christian Ethiopian community. Oromo people are largest ethnic group in Ethiopia. Muslim faith central. Strong oral tradition.',
     'Distinct religious and cultural identity from Ethiopian Orthodox community. Oromo language distinct from Amharic.',
     'Trust through mosques and Oromo community organizations.'],
    ['cp-24','Russian/Eastern European Community','European',JSON.stringify(['Russian','Ukrainian','English']),
     'Community includes refugees from former Soviet states, Ukraine, and Eastern Europe. Orthodox Christian and Jewish traditions.',
     'Russian language interpretation needed for older generations. Significant diversity in country of origin and political views.',
     'Trust through Eastern European community organizations and faith communities.'],
    ['cp-25','Latino Indigenous Community','Indigenous/Latino',JSON.stringify(['Spanish','Mayan Languages','English']),
     'Guatemalan Mayan and other Indigenous Latin American communities. Primary languages may be Mam, Quiché, or other Mayan languages — not Spanish.',
     'Spanish is often a second language. Mayan languages require specialized interpretation. Distinct cultural practices from Latino/Hispanic community broadly.',
     'Trust through Indigenous Maya organizations and legal aid providers.'],
    // Disability Communities
    ['cp-26','Deaf and Hard of Hearing Community','Disability',JSON.stringify(['ASL','English']),
     'Distinct cultural identity. American Sign Language is a complete, independent language — not a form of English. Deaf culture has its own history, humor, art, and community.',
     'Always provide ASL interpreters. Speak to the Deaf person directly — not the interpreter. Written English is a second language for many Deaf people. Video relay services available.',
     'Trust through DeafBlind Advocates, COMS, and Deaf community centers.'],
    ['cp-27','DeafBlind Community','Disability',JSON.stringify(['Tactile ASL','ProTactile','Braille']),
     'Small but distinct community with specialized communication needs. ProTactile and tactile ASL are primary communication modes. Not simply Deaf plus Blind.',
     'Support Service Providers (SSPs) are essential — not optional. ProTactile communication training needed for staff. Do not conflate with Deaf or Blind communities.',
     'Trust through DeafBlind Advocates of Minnesota.'],
    ['cp-28','Blind and Low Vision Community','Disability',JSON.stringify(['English']),
     'Diverse community — most people who are blind or have low vision are not born that way. Wide range of causes, ages, and accommodation needs.',
     'Accessible documents required: Braille, large print, audio, screen-reader compatible digital formats. Do not touch or guide without permission. Describe visual information.',
     'Trust through Vision Loss Resources and State Services for the Blind.'],
    // Other Specific Populations
    ['cp-29','LGBTQ+ Community','LGBTQ+',JSON.stringify(['English']),
     'Diverse community across all racial, ethnic, and disability groups. Higher rates of disability, poverty, and housing instability. Specific barriers in accessing services.',
     'Use correct names and pronouns. Do not assume gender or sexual orientation. LGBTQ+ people with disabilities face intersecting barriers. Gender-affirming care access is a key issue.',
     'Trust through OutFront MN, Rainbow Health, and LGBTQ+ affirming providers.'],
    ['cp-30','People Experiencing Housing Instability','Circumstance',JSON.stringify(['English','Varies']),
     'Cross-cultural population experiencing homelessness, housing instability, or domestic violence. Intersects with disability, mental health, substance use, and all racial communities.',
     'Trauma-informed approach essential. Flexible service delivery required. Documentation requirements can be a barrier. Housing first principles apply.',
     'Trust built through street outreach, shelter staff, and community health workers.'],
  ];
  // Insert all profiles with priority_flag = 0 (no prioritization — universal service)
  profiles.forEach(([id,community_name,category,languages_json,cultural_context,communication_guidance,trust_factors]) => 
    db.run(`INSERT OR IGNORE INTO community_profiles (id,community_name,category,languages_json,cultural_context,communication_guidance,trust_factors,priority_flag,created_at) VALUES (?,?,?,?,?,?,?,0,datetime('now'))`,
    [id,community_name,category,languages_json,cultural_context,communication_guidance,trust_factors])
  );

    // Training Courses
  const courses = [
    ['tc-1','Understanding Racism in America','Survey course on structural racism and its impact on disability services','self-paced','foundational','Denial',90,1],
    ['tc-2','Intercultural Development Inventory (IDI) Orientation','Introduction to IDI framework and your personal developmental orientation','facilitated','foundational','Minimization',60,1],
    ['tc-3','CLAS Standards in Practice','Applying the 15 National CLAS Standards in DSD program delivery','self-paced','intermediate','Minimization',120,0],
    ['tc-4','Disability Justice Framework','Ten principles of disability justice and application in government services','self-paced','foundational','Acceptance',90,0],
    ['tc-5','Cultural Humility in Service Delivery','Moving from cultural competence to cultural humility in practice','facilitated','intermediate','Acceptance',120,0],
    ['tc-6','Equity Analysis Toolkit (FARM)','Using the DHS Equity Analysis Toolkit for program and policy review','self-paced','advanced','Adaptation',180,1],
  ];
  courses.forEach(c => db.run(`INSERT OR IGNORE INTO training_courses (id,title,description,format,level,idi_stage,duration_minutes,is_required) VALUES (?,?,?,?,?,?,?,?)`, c));

  // Training Progress for gbanks
  db.run(`INSERT OR IGNORE INTO training_progress VALUES (?,?,?,?,?,datetime('now'))`,
    ['tp-1','user-consultant-1','tc-1',100,'2026-01-15']);
  db.run(`INSERT OR IGNORE INTO training_progress VALUES (?,?,?,?,?,datetime('now'))`,
    ['tp-2','user-consultant-1','tc-2',100,'2026-02-01']);
  db.run(`INSERT OR IGNORE INTO training_progress VALUES (?,?,?,?,?,datetime('now'))`,
    ['tp-3','user-consultant-1','tc-6',75,null]);

  // DEIA Topics
  const topics = [
    ['topic-1','Intersectionality','The interconnected nature of social categorizations creating overlapping systems of discrimination','Disability, race, language, and immigration status intersect in DSD service delivery. A Somali woman with a disability faces compounded barriers.',JSON.stringify(['Crenshaw','Collins','critical race theory'])],
    ['topic-2','Cultural Humility','Lifelong process of self-reflection and learning about culture; different from cultural competence','Practitioners hold curiosity about each person rather than assuming knowledge based on group membership.',JSON.stringify(['Tervalon & Murray-Garcia','Hooks','IDI'])],
    ['topic-3','Structural Racism','Cumulative and compounding effects of racial bias across institutions, history, and culture','Disparities in HCBS waiver approval rates across racial groups reflect structural factors, not individual choices.',JSON.stringify(['GARE','Rothstein','Coates'])],
    ['topic-4','Disability Justice','Framework developed by disabled activists of color centering intersectionality and collective liberation','Goes beyond ADA compliance to address power, access, and interdependence in community.',JSON.stringify(['Sins Invalid','Mia Mingus','Leroy Moore'])],
    ['topic-5','Language Justice','The right of people to communicate in the language in which they think and feel most comfortable','CLAS Standards require language access services. This is a civil right, not a courtesy.',JSON.stringify(['CLAS Standards','EO 13166','Title VI'])],
  ];
  topics.forEach(t => db.run(`INSERT OR IGNORE INTO deia_topics (id,title,definition,dsd_relevance,frameworks,tags_json,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`, [...t.slice(0,4), t[4], t[4], ]));

  // fix topic insert
  db.run('DELETE FROM deia_topics');
  topics.forEach(([id,title,definition,dsd_relevance,frameworks]) => db.run(
    `INSERT OR IGNORE INTO deia_topics (id,title,definition,dsd_relevance,frameworks,tags_json,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
    [id,title,definition,dsd_relevance,frameworks,JSON.stringify([])]
  ));

  // Spaced Retrieval
  const prompts = [
    ['srp-1',1,'What are the 15 CLAS Standards and how do they apply to MnCHOICES?','Minimization'],
    ['srp-2',2,'Describe the five stages of the Intercultural Development Continuum and give an example of each.','Minimization'],
    ['srp-3',3,'How does intersectionality apply to a Hmong elder with a disability seeking HCBS services?','Acceptance'],
    ['srp-4',4,'What is the difference between language access and interpretation services?','Minimization'],
    ['srp-5',5,'Name three ways structural racism manifests in disability service systems.','Acceptance'],
  ];
  prompts.forEach(p => db.run(`INSERT OR IGNORE INTO spaced_retrieval_prompts (id,week_number,prompt_text,idi_stage,active) VALUES (?,?,?,?,1)`, p));

  // Weekly Synthesis
  db.run(`INSERT OR IGNORE INTO weekly_syntheses (id,week_start,synthesis_text,week_number,created_at) VALUES (?,?,?,?,datetime('now'))`,
    ['ws-1','2026-03-23',"This week's equity work centered on consultation support for the MnCHOICES assessment cultural adaptation project. Three consultations were triaged — one urgent (PCA provider rate changes), two high priority. Key insight: language access gaps are the most frequently cited barrier across all priority populations this quarter. Action: escalate language access plan to DSD leadership.",13]);

  // Agent Definitions
  const agents = [
    ['agent-1','Consultation Triage Agent','supervised','mandatory',JSON.stringify({model:'claude-sonnet-4-20250514',maxTokens:500}),1],
    ['agent-2','Equity Review Assistant','supervised','mandatory',JSON.stringify({model:'claude-sonnet-4-20250514',maxTokens:1024}),1],
    ['agent-3','Goal Decomposition Agent','supervised','mandatory',JSON.stringify({model:'claude-sonnet-4-20250514',maxTokens:1500}),1],
    ['agent-4','Learning Loop Agent','supervised','mandatory',JSON.stringify({model:'claude-sonnet-4-20250514',maxTokens:800}),1],
    ['agent-5','Quarterly Report Generator','supervised','mandatory',JSON.stringify({model:'claude-sonnet-4-20250514',maxTokens:3000}),1],
    ['agent-6','Document Classifier','supervised','mandatory',JSON.stringify({model:'claude-haiku-4-5-20251001',maxTokens:300}),1],
  ];
  agents.forEach(a => db.run(`INSERT OR IGNORE INTO agent_definitions (id,name,autonomy,approval_gate,config_json,is_active,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`, a));

  // Learning Loop Proposals
  db.run(`INSERT OR IGNORE INTO learning_loop_proposals (id,trigger_pattern,suggested_change,lint_score,status,proposed_by,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
    ['llp-1','Consultation volume spike in language access category','Add CLAS Standards 5-8 quick reference to consultant dashboard','92','pending','agent-4']);
  db.run(`INSERT OR IGNORE INTO learning_loop_proposals (id,trigger_pattern,suggested_change,lint_score,status,proposed_by,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
    ['llp-2','Three consecutive IDI training completions in Denial stage','Recommend foundational anti-racism module sequencing adjustment','87','pending','agent-4']);

  // Approval Queue
  db.run(`INSERT OR IGNORE INTO approval_queue (id,item_type,item_id,title,content,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))`,
    ['aq-1','learning_loop_proposal','llp-1','Review: CLAS Standards Dashboard Addition','Add CLAS Standards 5-8 quick reference card to consultant dashboard sidebar. Estimated implementation: 2 hours.','pending','agent-4']);
  db.run(`INSERT OR IGNORE INTO approval_queue (id,item_type,item_id,title,content,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))`,
    ['aq-2','learning_loop_proposal','llp-2','Review: IDI Training Sequence Adjustment','Reorder foundational modules to front-load Understanding Racism content for Denial-stage learners.','pending','agent-4']);

  // Working Groups
  const wgs = [
    ['wg-1','Language Access Implementation Team','CLAS Standards 5-8 compliance across DSD','active','Currently mapping interpreter needs across all 150+ staff interactions monthly.'],
    ['wg-2','Indigenous Services Workgroup','Culturally responsive services for Minnesota Native Nations','active','Developing nation-specific service protocols in partnership with tribal social services.'],
    ['wg-3','Disability Justice Study Circle','Deepening disability justice framework literacy','active','Monthly 90-minute sessions using Sins Invalid curriculum.'],
    ['wg-4','Data Equity Subcommittee','Disaggregating DSD outcome data by race and disability type','active','Working with MNIT to build equity dashboards from existing data systems.'],
  ];
  wgs.forEach(w => db.run(`INSERT OR IGNORE INTO working_groups (id,name,initiative,status,findings_summary,members_json) VALUES (?,?,?,?,?,?)`, [...w, '[]']));

  // Equity Team
  const team = [
    ['et-1','Teresa vanderBent','Co-Lead, Language Access','DSD Programs'],
    ['et-2','Leigh Ann Ahmad','Co-Lead, Community Engagement','DSD Community Relations'],
    ['et-3','Carrie Jakober','Training Coordinator','DSD Workforce Development'],
    ['et-4','Leah Zoladkiewicz','Data & Accountability','DSD Quality Assurance'],
    ['et-5','Marcus Thompson','Indigenous Services Liaison','DSD Field Operations'],
    ['et-6','Amina Hassan','Somali Community Liaison','DSD Community Relations'],
    ['et-7','Cha Vang','Hmong Community Liaison','DSD Community Relations'],
    ['et-8','Rosa Medina','Latino Community Liaison','DSD Community Relations'],
    ['et-9','James Bear','Tribal Relations Coordinator','DSD Policy'],
    ['et-10','Sarah Kim','Disability Justice Advocate','DSD Self-Directed Services'],
  ];
  team.forEach(t => db.run(`INSERT OR IGNORE INTO equity_team (id,full_name,charter_role,unit,joined_at) VALUES (?,?,?,?,datetime('now'))`, t));

  // Community Feedback
  const feedback = [
    ['cf-1','The MnCHOICES assessment form was very confusing. My caseworker had to explain every question.','Anonymous','Somali Community','Q1 2026','negative'],
    ['cf-2','Finally someone asked us about our needs. The Hmong advisory meeting was very respectful.','Hmong Elder Council','Hmong Community','Q1 2026','positive'],
    ['cf-3','We need interpreters at every appointment, not just when we ask. We should not have to fight for this.','Self-Advocate','Disability Community','Q4 2025','negative'],
    ['cf-4','The new plain language materials are much better. My family can understand them now.','Parent','Latino/a/x Community','Q1 2026','positive'],
    ['cf-5','DSD staff do not understand tribal sovereignty. We are not a county. We are a nation.','Tribal Council Representative','Indigenous Nations','Q4 2025','negative'],
  ];
  feedback.forEach(f => db.run(`INSERT OR IGNORE INTO community_feedback (id,feedback_text,attribution,community_tag,collection_cycle,sentiment,created_at) VALUES (?,?,?,?,?,?,datetime('now'))`, f));

  // Calendar Events
  const events = [
    ['evt-1','One DSD Equity Team Monthly Meeting','2026-04-02','team_meeting','Monthly meeting of the One DSD equity volunteer team','DSD Conference Room B',1],
    ['evt-2','IDI Group Debrief — DSD Leadership','2026-04-08','training','Intercultural Development Inventory debrief session for senior leadership','DSD Executive Conference Room',0],
    ['evt-3','Hmong Advisory Circle — Inaugural Meeting','2026-04-10','community','First meeting of the Hmong Community Advisory Circle','Hmong American Partnership, St. Paul',0],
    ['evt-4','CLAS Standards Training — Cohort 1','2026-04-15','training','CLAS Standards 1-15 foundational training for DSD staff','Virtual/Teams',0],
    ['evt-5','Language Access Plan Presentation to Leadership','2026-04-22','presentation','Present draft Language Access Plan to DSD Deputy Commissioner','DSD Executive Conference Room',0],
    ['evt-6','One DSD Equity Program — Kickoff Session','2026-04-29','all_staff','All-staff equity program launch and orientation','DSD Main Conference Center',0],
    ['evt-7','IDI Coaching — Cohort 1 begins','2026-05-01','training','Individual IDI coaching sessions begin for first cohort of 15 staff','Virtual/Teams',0],
    ['evt-8','MN DEIA Summit — MHFA','2026-05-13','conference','Minnesota Department of Human Services DEIA Summit','DoubleTree by Hilton, Bloomington',0],
  ];
  events.forEach(e => db.run(`INSERT OR IGNORE INTO calendar_events (id,title,event_date,event_type,description,location,is_recurring) VALUES (?,?,?,?,?,?,?)`, e));

  // Team Activities
  const activities = [
    ['ta-1','Privilege Walk','reflection',30,'Power and Privilege','Paper cards with statements','Participants step forward or backward based on life experiences statements. Debrief focuses on how privilege and marginalization intersect.'],
    ['ta-2','Spectrum of Beliefs','dialogue',45,'Controversial Topics','None','Facilitator reads statements; participants move to agree/disagree spectrum. Builds capacity for dialogue on difficult equity topics.'],
    ['ta-3','Four Corners','values',20,'Core Values','4 posted signs (Strongly Agree, Agree, Disagree, Strongly Disagree)','Quick opinion polling activity to surface team diversity of thought on equity-related statements.'],
    ['ta-4','Fishbowl Discussion','dialogue',60,'Deep Listening','Chairs in concentric circles','Inner circle discusses topic while outer circle observes. Rotates. Builds listening and perspective-taking skills.'],
    ['ta-5','Identity Iceberg','identity',45,'Social Identity','Printed iceberg template','Participants map visible and invisible aspects of identity. Reveals how much of identity is below the surface.'],
    ['ta-6','Microaggression Case Studies','workplace',60,'Microaggressions','Case study handouts','Small groups analyze real DSD scenarios, identify microaggressions, and practice responses.'],
    ['ta-7','Community Asset Mapping','community',45,'Community Strengths','Large paper, markers','Teams map assets and resources in a priority community. Shifts from deficit to asset-based thinking.'],
    ['ta-8','Equity in Data Exercise','data equity',60,'Disaggregated Data','Dataset printouts','Teams analyze DSD program data disaggregated by race/disability. Identify disparities and hypothesize root causes.'],
  ];
  activities.forEach(a => db.run(`INSERT OR IGNORE INTO team_activities (id,title,category,duration_minutes,equity_theme,materials,instructions,created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))`, a));

  // COS Clusters
  const clusters = [
    ['cl-1','Disparity Analysis','primary','#4A9EDB','Analyze service gaps, outcome disparities, and equity indicators across DSD programs'],
    ['cl-2','Consultation & Advisory','primary','#78BE21','Provide equity consultation to DSD units, managers, and front-line staff'],
    ['cl-3','Program Design Review','primary','#003865','Evaluate DSD programs for equity, accessibility, and cultural responsiveness'],
    ['cl-4','Training & Development','primary','#9B59B6','Design and deliver equity-focused learning experiences for DSD workforce'],
    ['cl-5','Community Engagement','primary','#E67E22','Build and maintain relationships with priority communities served by DSD'],
    ['cl-6','Learning & Capacity Building','secondary','#FB923C','Build equity competency through training, spaced retrieval, and learning loops'],
    ['cl-7','Strategic Communications','secondary','#4A9EDB','Communicate equity program progress, priorities, and impact'],
    ['cl-8','Agentic OS Management','primary','#E05252','Manage, approve, audit, and improve the AI agent infrastructure of the COS'],
    ['cl-9','Executive Advising','primary','#78BE21','Provide equity-informed strategic counsel to DSD leadership'],
  ];
  clusters.forEach(c => db.run(`INSERT OR IGNORE INTO cos_clusters (id,cluster_id,cluster_type,color,description) VALUES (?,?,?,?,?)`, c));

  // COS Atoms (sample — key ones)
  const atoms = [
    ['atom-d01','D.01','cl-1','D01','Analyze','disparity indicators','DSD leadership','quantitative','Disparity report','analysis','Conduct regular analysis of service outcome data disaggregated by race, disability, and other equity dimensions',0],
    ['atom-d02','D.02','cl-1','D02','Identify','root causes of disparity','Program managers','qualitative','Root cause analysis','synthesis','Apply root cause analysis frameworks to identify systemic factors driving observed disparities',0],
    ['atom-d03','D.03','cl-1','D03','Map','service access barriers','Community members','participatory','Barrier inventory','community','Document barriers experienced by priority populations in accessing DSD services',0],
    ['atom-c01','C.01','cl-2','C01','Triage','consultation requests','All DSD staff','advisory','Priority assessment','advisory','Assess and prioritize incoming consultation requests using urgency and impact criteria',1],
    ['atom-c02','C.02','cl-2','C02','Provide','CLAS Standards guidance','Program staff','advisory','CLAS recommendations','advisory','Advise on application of National CLAS Standards to specific program contexts',0],
    ['atom-o01','O.01','cl-3','O01','Conduct','equity review','Program managers','evaluative','Equity assessment','program','Apply DHS Equity Analysis Toolkit (FARM) to evaluate DSD programs for equity gaps',0],
    ['atom-l01','L.01','cl-4','L01','Design','equity training','DSD workforce','instructional','Training curriculum','learning','Develop culturally responsive equity training materials aligned to IDI stages',0],
    ['atom-w01','W.01','cl-5','W01','Facilitate','community listening sessions','Priority communities','facilitation','Community input report','community','Design and facilitate structured listening sessions with DSD priority populations',0],
    ['atom-a01','A.01','cl-8','A01','Review','agent outputs','Equity consultant','governance','Approval decision','governance','Review and approve or reject outputs generated by autonomous COS agents',1],
    ['atom-x01','X.01','cl-9','X01','Advise','DSD leadership','Deputy Commissioner','strategic','Strategic recommendation','executive','Provide equity-informed strategic counsel on DSD priorities and initiatives',0],
  ];
  atoms.forEach(a => db.run(`INSERT OR IGNORE INTO cos_atoms (id,atom_id,cluster_id,function_id,verb,object,stakeholder,mode,output,taxonomy,source_statement,agent_enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, a));

  // Audit Log
  const auditEvents = [
    ['al-1','system_init','Database initialized with One DSD COS v5.1 seed data',null,'system'],
    ['al-2','auth_login','User gbanks authenticated',null,'user-consultant-1'],
    ['al-3','consultation_created','New consultation: PCA Provider Rate Changes',null,'user-staff-1'],
    ['al-4','equity_review_created','Equity review started: HCBS Waiver Process',null,'user-consultant-1'],
  ];
  auditEvents.forEach(([id,event_type,details,agent_id,user_id]) => db.run(
    `INSERT OR IGNORE INTO audit_log (id,event_type,details,agent_id,user_id,created_at) VALUES (?,?,?,?,?,datetime('now'))`,
    [id,event_type,details,agent_id,user_id]
  ));

  saveDb();
  console.log('✅ Database seeded successfully');
}

module.exports = { getDb, saveDb };
