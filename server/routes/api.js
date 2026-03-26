const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query, queryOne } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const ai = require('../ai/claude');

const router = express.Router();

function auditLog(eventType, userId, details) {
  query('INSERT INTO audit_log (id,event_type,details,user_id,created_at) VALUES (?,?,?,?,NOW())',
    [uuidv4(), eventType, details, userId]).catch(e => console.error('Audit error:', e.message));
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get('/dashboard/stats', requireAuth, async (req, res) => {
  try {
    const [active, pending, resources, progress, goals, totalGoals, approvals, profiles] = await Promise.all([
      queryOne("SELECT COUNT(*) as n FROM consultations WHERE status IN ('open','in_progress')"),
      queryOne("SELECT COUNT(*) as n FROM action_items WHERE status != 'completed'"),
      queryOne("SELECT COUNT(*) as n FROM resources"),
      queryOne('SELECT COALESCE(AVG(progress),0) as avg FROM training_progress WHERE user_id = ?', [req.user.id]),
      queryOne("SELECT COUNT(*) as n FROM operational_goals WHERE status = 'active'"),
      queryOne('SELECT COUNT(*) as n FROM operational_goals'),
      queryOne("SELECT COUNT(*) as n FROM approval_queue WHERE status = 'pending'"),
      queryOne('SELECT COUNT(*) as n FROM community_profiles'),
    ]);
    res.json({
      activeConsultations: parseInt(active.n),
      pendingActions:      parseInt(pending.n),
      resourcesAvailable:  parseInt(resources.n),
      trainingProgress:    Math.round(parseFloat(progress.avg)),
      goalsOnTrack:        parseInt(goals.n),
      totalGoals:          parseInt(totalGoals.n),
      pendingApprovals:    parseInt(approvals.n),
      communityProfiles:   parseInt(profiles.n),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Equity Reviews ───────────────────────────────────────────────────────────

router.get('/equity-reviews', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM equity_reviews ORDER BY created_at DESC')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/equity-reviews', requireAuth, async (req, res) => {
  try {
    const { title, level, step_data } = req.body;
    const row = await queryOne(
      `INSERT INTO equity_reviews (id,title,level,status,current_step,step_data,user_id,created_at,updated_at)
       VALUES (?,?,?,'in_progress',1,?,?,NOW(),NOW()) RETURNING *`,
      [uuidv4(), title, level||'scan', JSON.stringify(step_data||{}), req.user.id]
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/equity-reviews/:id', requireAuth, async (req, res) => {
  try {
    const r = await queryOne('SELECT * FROM equity_reviews WHERE id=?', [req.params.id]);
    r ? res.json(r) : res.status(404).json({error:'Not found'});
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.patch('/equity-reviews/:id', requireAuth, async (req, res) => {
  try {
    const { title, status, current_step, step_data } = req.body;
    const row = await queryOne(
      `UPDATE equity_reviews SET title=COALESCE(?,title),status=COALESCE(?,status),current_step=COALESCE(?,current_step),step_data=COALESCE(?,step_data),updated_at=NOW() WHERE id=? RETURNING *`,
      [title||null,status||null,current_step||null,step_data?JSON.stringify(step_data):null,req.params.id]
    );
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Action Items ─────────────────────────────────────────────────────────────

router.get('/action-items', requireAuth, async (req, res) => {
  try {
    const { status, priority } = req.query;
    let sql = 'SELECT * FROM action_items WHERE 1=1'; const p = [];
    if (status)   { sql+=' AND status=?';   p.push(status); }
    if (priority) { sql+=' AND priority=?'; p.push(priority); }
    res.json(await query(sql+' ORDER BY due_date ASC NULLS LAST', p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/action-items', requireAuth, async (req, res) => {
  try {
    const { title, description, owner, due_date, priority, goal_id } = req.body;
    const row = await queryOne(
      `INSERT INTO action_items (id,title,description,owner,status,priority,progress,due_date,goal_id,created_at)
       VALUES (?,?,?,?,'not_started',?,0,?,?,NOW()) RETURNING *`,
      [uuidv4(),title,description||null,owner||null,priority||'normal',due_date||null,goal_id||null]
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.patch('/action-items/:id', requireAuth, async (req, res) => {
  try {
    const { title, status, progress, due_date, priority, owner } = req.body;
    const row = await queryOne(
      `UPDATE action_items SET title=COALESCE(?,title),status=COALESCE(?,status),progress=COALESCE(?,progress),due_date=COALESCE(?,due_date),priority=COALESCE(?,priority),owner=COALESCE(?,owner) WHERE id=? RETURNING *`,
      [title||null,status||null,progress!=null?progress:null,due_date||null,priority||null,owner||null,req.params.id]
    );
    if (status==='completed') auditLog('action_completed',req.user.id,`Completed ${req.params.id}`);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Consultations ────────────────────────────────────────────────────────────

router.get('/consultations', requireAuth, async (req, res) => {
  try {
    const { status, priority } = req.query;
    let sql = 'SELECT * FROM consultations WHERE 1=1'; const p = [];
    if (status)   { sql+=' AND status=?';   p.push(status); }
    if (priority) { sql+=' AND priority=?'; p.push(priority); }
    sql += " ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, created_at DESC";
    res.json(await query(sql, p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/consultations', requireAuth, async (req, res) => {
  try {
    const { title, description, department, priority, assigned_to } = req.body;
    const row = await queryOne(
      `INSERT INTO consultations (id,title,description,department,status,priority,requester_id,assigned_to,created_at,updated_at)
       VALUES (?,?,?,?,'open',?,?,?,NOW(),NOW()) RETURNING *`,
      [uuidv4(),title,description||null,department||null,priority||'normal',req.user.id,assigned_to||null]
    );
    auditLog('consultation_created',req.user.id,`New consultation: ${title}`);
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.patch('/consultations/:id', requireAuth, async (req, res) => {
  try {
    const { status, priority, assigned_to } = req.body;
    const row = await queryOne(
      `UPDATE consultations SET status=COALESCE(?,status),priority=COALESCE(?,priority),assigned_to=COALESCE(?,assigned_to),updated_at=NOW() WHERE id=? RETURNING *`,
      [status||null,priority||null,assigned_to||null,req.params.id]
    );
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Resources ────────────────────────────────────────────────────────────────

router.get('/resources', requireAuth, async (req, res) => {
  try {
    const { category, search } = req.query;
    let sql = 'SELECT * FROM resources WHERE 1=1'; const p = [];
    if (category&&category!=='all') { sql+=' AND category=?'; p.push(category); }
    if (search) { sql+=' AND (title ILIKE ? OR description ILIKE ?)'; p.push(`%${search}%`,`%${search}%`); }
    res.json(await query(sql+' ORDER BY title ASC', p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/resources', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try {
    const { title, category, description, content, is_featured } = req.body;
    const row = await queryOne(
      `INSERT INTO resources (id,title,category,description,content,is_featured,created_at) VALUES (?,?,?,?,?,?,NOW()) RETURNING *`,
      [uuidv4(),title,category||null,description||null,content||null,is_featured?1:0]
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Community Profiles ───────────────────────────────────────────────────────

router.get('/community-profiles', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM community_profiles ORDER BY community_name ASC')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/community-profiles/:id', requireAuth, async (req, res) => {
  try {
    const r = await queryOne('SELECT * FROM community_profiles WHERE id=?', [req.params.id]);
    r ? res.json(r) : res.status(404).json({error:'Not found'});
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.patch('/community-profiles/:id', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try {
    const { cultural_context, communication_guidance, trust_factors, service_considerations, priority_flag } = req.body;
    const row = await queryOne(
      `UPDATE community_profiles SET cultural_context=COALESCE(?,cultural_context),communication_guidance=COALESCE(?,communication_guidance),trust_factors=COALESCE(?,trust_factors),service_considerations=COALESCE(?,service_considerations),priority_flag=COALESCE(?,priority_flag) WHERE id=? RETURNING *`,
      [cultural_context||null,communication_guidance||null,trust_factors||null,service_considerations||null,priority_flag!=null?priority_flag:null,req.params.id]
    );
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Training ─────────────────────────────────────────────────────────────────

router.get('/training-courses', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM training_courses ORDER BY level ASC, title ASC')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/training-progress', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM training_progress WHERE user_id=?', [req.user.id])); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/training-progress', requireAuth, async (req, res) => {
  try {
    const { course_id, progress } = req.body;
    const row = await queryOne(
      `INSERT INTO training_progress (id,user_id,course_id,progress,completed_at,updated_at)
       VALUES (?,?,?,?,CASE WHEN ? >= 100 THEN NOW() ELSE null END,NOW())
       ON CONFLICT (user_id,course_id) DO UPDATE SET progress=EXCLUDED.progress,completed_at=CASE WHEN EXCLUDED.progress >= 100 THEN NOW() ELSE training_progress.completed_at END,updated_at=NOW()
       RETURNING *`,
      [uuidv4(),req.user.id,course_id,progress,progress]
    );
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DEIA Topics ──────────────────────────────────────────────────────────────

router.get('/deia-topics', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM deia_topics ORDER BY title ASC')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Reflections ──────────────────────────────────────────────────────────────

router.get('/reflections', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM reflections WHERE user_id=? ORDER BY created_at DESC', [req.user.id])); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/reflections', requireAuth, async (req, res) => {
  try {
    const { reflection_text, prompt_id } = req.body;
    const row = await queryOne(
      'INSERT INTO reflections (id,user_id,reflection_text,prompt_id,created_at) VALUES (?,?,?,?,NOW()) RETURNING *',
      [uuidv4(),req.user.id,reflection_text,prompt_id||null]
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Spaced Retrieval ─────────────────────────────────────────────────────────

router.get('/spaced-retrieval/this-week', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM spaced_retrieval_prompts WHERE active=1 ORDER BY RANDOM() LIMIT 3')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Weekly Syntheses ─────────────────────────────────────────────────────────

router.get('/weekly-syntheses', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM weekly_syntheses ORDER BY week_start DESC LIMIT 12')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Operational Goals ────────────────────────────────────────────────────────

router.get('/operational-goals', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM operational_goals ORDER BY number ASC')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/operational-goals', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try {
    const { title, description, target_date, weight } = req.body;
    const maxNum = await queryOne('SELECT COALESCE(MAX(number),0) as n FROM operational_goals');
    const row = await queryOne(
      `INSERT INTO operational_goals (id,number,title,description,weight,base_progress,target_date,status) VALUES (?,?,?,?,?,0,?,'active') RETURNING *`,
      [uuidv4(),(parseInt(maxNum.n)||0)+1,title,description||null,weight||15,target_date||null]
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.patch('/operational-goals/:id', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try {
    const { title, description, status, base_progress, target_date } = req.body;
    const row = await queryOne(
      `UPDATE operational_goals SET title=COALESCE(?,title),description=COALESCE(?,description),status=COALESCE(?,status),base_progress=COALESCE(?,base_progress),target_date=COALESCE(?,target_date) WHERE id=? RETURNING *`,
      [title||null,description||null,status||null,base_progress!=null?base_progress:null,target_date||null,req.params.id]
    );
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Agent Definitions ────────────────────────────────────────────────────────

router.get('/agent-definitions', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM agent_definitions WHERE is_active=1 ORDER BY name ASC')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Learning Loop ────────────────────────────────────────────────────────────

router.get('/learning-loop-proposals', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM learning_loop_proposals ORDER BY created_at DESC')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/learning-loop-proposals/:id/decide', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try {
    const { decision } = req.body;
    const row = await queryOne('UPDATE learning_loop_proposals SET status=?,decided_by=? WHERE id=? RETURNING *', [decision,req.user.id,req.params.id]);
    auditLog('loop_decided',req.user.id,`${decision} loop proposal ${req.params.id}`);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Approval Queue ───────────────────────────────────────────────────────────

router.get('/approval-queue', requireAuth, async (req, res) => {
  try { res.json(await query("SELECT * FROM approval_queue WHERE status='pending' ORDER BY created_at ASC")); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/approval-queue/:id/decide', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try {
    const { decision } = req.body;
    const row = await queryOne('UPDATE approval_queue SET status=?,decided_at=NOW() WHERE id=? RETURNING *', [decision,req.params.id]);
    auditLog('approval_decided',req.user.id,`${decision} approval ${req.params.id}`);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Consultant Documents ─────────────────────────────────────────────────────

router.get('/consultant-documents', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try {
    const { classification } = req.query;
    let sql='SELECT * FROM consultant_documents WHERE 1=1'; const p=[];
    if (classification) { sql+=' AND classification=?'; p.push(classification); }
    res.json(await query(sql+' ORDER BY created_at DESC', p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/consultant-documents', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try {
    const { filename, file_type, classification, routing_destination, authority_level } = req.body;
    const row = await queryOne(
      `INSERT INTO consultant_documents (id,filename,file_type,classification,routing_destination,authority_level,upload_date,created_at)
       VALUES (?,?,?,?,?,?,CURRENT_DATE::TEXT,NOW()) RETURNING *`,
      [uuidv4(),filename,file_type||null,classification||'reference',routing_destination||'knowledge_base',authority_level||'internal']
    );
    auditLog('doc_created',req.user.id,`Created document: ${filename}`);
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Audit Log ────────────────────────────────────────────────────────────────

router.get('/audit-log', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try {
    const limit=parseInt(req.query.limit)||50; const { event_type } = req.query;
    let sql='SELECT * FROM audit_log WHERE 1=1'; const p=[];
    if (event_type) { sql+=' AND event_type=?'; p.push(event_type); }
    res.json(await query(sql+' ORDER BY created_at DESC LIMIT ?', [...p,limit]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ODET Hub ─────────────────────────────────────────────────────────────────

router.get('/working-groups', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM working_groups ORDER BY name ASC')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/odet-records', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM odet_records ORDER BY created_at DESC LIMIT 50')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/equity-team', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM equity_team ORDER BY full_name ASC')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/community-feedback', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM community_feedback ORDER BY created_at DESC LIMIT 50')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/community-feedback', requireAuth, async (req, res) => {
  try {
    const { feedback_text, attribution, community_tag, collection_cycle, sentiment } = req.body;
    const row = await queryOne(
      'INSERT INTO community_feedback (id,feedback_text,attribution,community_tag,collection_cycle,sentiment,created_at) VALUES (?,?,?,?,?,?,NOW()) RETURNING *',
      [uuidv4(),feedback_text,attribution||null,community_tag||null,collection_cycle||null,sentiment||'neutral']
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/calendar-events', requireAuth, async (req, res) => {
  try {
    res.json(await query(
      "SELECT * FROM calendar_events WHERE event_date >= (CURRENT_DATE - INTERVAL '7 days')::TEXT ORDER BY event_date ASC LIMIT 30"
    ));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/team-activities', requireAuth, async (req, res) => {
  try {
    const { category, duration } = req.query;
    let sql='SELECT * FROM team_activities WHERE 1=1'; const p=[];
    if (category) { sql+=' AND category=?'; p.push(category); }
    if (duration) { sql+=' AND duration_minutes<=?'; p.push(parseInt(duration)); }
    res.json(await query(sql+' ORDER BY title ASC', p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── AI ───────────────────────────────────────────────────────────────────────

router.post('/equity-assist', requireAuth, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Set ANTHROPIC_API_KEY to enable AI' });
  try {
    const { question, context, pageContext } = req.body;
    if (!question) return res.status(400).json({ error: 'question required' });
    const response = await ai.equityAssist({ question, context, pageContext });
    auditLog('ai_assist', req.user.id, question.substring(0, 80));
    res.json({ response });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/goal-decompose', requireAuth, requireRole('equity_lead'), async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI not configured' });
  try { res.json({ response: await ai.goalDecompose(req.body) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/reports/quarterly/generate', requireAuth, requireRole('equity_lead'), async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI not configured' });
  try {
    const { quarter, year } = req.body;
    const [goalsData, consultationsData, actionsData] = await Promise.all([
      query('SELECT title,status,base_progress FROM operational_goals'),
      queryOne("SELECT COUNT(*) as total, SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) as resolved FROM consultations"),
      queryOne("SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed FROM action_items"),
    ]);
    const report = await ai.generateQuarterlyReport({ quarter, year, goalsData, consultationsData, actionsData });
    auditLog('report_generated', req.user.id, `Q${quarter} ${year} report`);
    res.json({ report });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── COS ──────────────────────────────────────────────────────────────────────

router.get('/cos/stats', requireAuth, async (req, res) => {
  try {
    const [total, enabled, clusters, outputs, approvals] = await Promise.all([
      queryOne('SELECT COUNT(*) as n FROM cos_atoms'),
      queryOne('SELECT COUNT(*) as n FROM cos_atoms WHERE agent_enabled=1'),
      queryOne('SELECT COUNT(*) as n FROM cos_clusters'),
      queryOne('SELECT COUNT(*) as n FROM cos_outputs'),
      queryOne("SELECT COUNT(*) as n FROM cos_approvals WHERE status='pending'"),
    ]);
    res.json({
      totalAtoms: parseInt(total.n),
      enabledAtoms: parseInt(enabled.n),
      totalClusters: parseInt(clusters.n),
      totalOutputs: parseInt(outputs.n),
      pendingApprovals: parseInt(approvals.n),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/cos/clusters', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM cos_clusters ORDER BY cluster_id ASC')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/cos/atoms', requireAuth, async (req, res) => {
  try {
    const { clusterId } = req.query;
    let sql='SELECT a.*,c.cluster_id as cluster_code FROM cos_atoms a LEFT JOIN cos_clusters c ON a.cluster_id=c.id WHERE 1=1'; const p=[];
    if (clusterId) { sql+=' AND a.cluster_id=?'; p.push(clusterId); }
    res.json(await query(sql+' ORDER BY a.atom_id ASC', p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.patch('/cos/atoms/:id/toggle', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try {
    const row = await queryOne('UPDATE cos_atoms SET agent_enabled=CASE WHEN agent_enabled=1 THEN 0 ELSE 1 END WHERE id=? RETURNING *', [req.params.id]);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/cos/execute/:atomId', requireAuth, requireRole('equity_lead'), async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Set ANTHROPIC_API_KEY to execute COS atoms' });
  try {
    const atom = await queryOne('SELECT a.*,c.cluster_id as cluster_code FROM cos_atoms a LEFT JOIN cos_clusters c ON a.cluster_id=c.id WHERE a.id=?', [req.params.atomId]);
    if (!atom) return res.status(404).json({ error: 'Atom not found' });
    const { context } = req.body;
    const atomName = `${atom.verb} ${atom.object}`;
    const output = await ai.executeCosAtom({ atomCode: atom.atom_id, atomName, cluster: atom.cluster_code, context: context||atom.source_statement||atomName });
    const outputId = uuidv4(), approvalId = uuidv4();
    await Promise.all([
      queryOne(`INSERT INTO cos_outputs (id,atom_id,title,content,status,created_at,updated_at) VALUES (?,?,?,?,'pending_review',NOW(),NOW()) RETURNING id`, [outputId,atom.id,atomName,output]),
      queryOne(`INSERT INTO cos_approvals (id,atom_id,atom_name,output_text,output_type,status,created_at) VALUES (?,?,?,?,'text','pending',NOW()) RETURNING id`, [approvalId,atom.id,atomName,output]),
    ]);
    auditLog('cos_executed', req.user.id, `${atom.atom_id} — ${atomName}`);
    res.json({ output, outputId, approvalId });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});
router.get('/cos/approvals', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try { res.json(await query("SELECT * FROM cos_approvals WHERE status='pending' ORDER BY created_at ASC")); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/cos/approvals/:id/decide', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try {
    const { decision, revision_notes } = req.body;
    const approval = await queryOne('UPDATE cos_approvals SET status=?,revision_notes=?,decided_at=NOW() WHERE id=? RETURNING *', [decision,revision_notes||null,req.params.id]);
    if (approval) {
      await query("UPDATE cos_outputs SET status=? WHERE atom_id=? AND status='pending_review'",
        [decision==='approved'?'approved':'rejected', approval.atom_id]);
    }
    auditLog('cos_approval', req.user.id, `${decision} approval ${req.params.id}`);
    res.json(approval);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/cos/outputs', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try {
    const { status } = req.query;
    let sql='SELECT * FROM cos_outputs WHERE 1=1'; const p=[];
    if (status) { sql+=' AND status=?'; p.push(status); }
    res.json(await query(sql+' ORDER BY created_at DESC LIMIT 50', p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.patch('/cos/outputs/:id', requireAuth, requireRole('equity_lead'), async (req, res) => {
  try {
    const { status } = req.body;
    const row = await queryOne("UPDATE cos_outputs SET status=COALESCE(?,status),updated_at=NOW() WHERE id=? RETURNING *", [status||null,req.params.id]);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CSV Downloads ────────────────────────────────────────────────────────────

function toCSV(rows) {
  if (!rows.length) return '';
  const hdrs = Object.keys(rows[0]);
  const esc = v => { const s=v==null?'':String(v).replace(/"/g,'""'); return s.includes(',')||s.includes('"')||s.includes('\n')?`"${s}"`:s; };
  return [hdrs.join(','), ...rows.map(r => hdrs.map(h=>esc(r[h])).join(','))].join('\n');
}
router.get('/download/consultations', requireAuth, requireRole('equity_lead'), async (req, res) => {
  const rows = await query('SELECT id,title,department,priority,status,created_at FROM consultations ORDER BY created_at DESC');
  res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="consultations.csv"'); res.send(toCSV(rows));
});
router.get('/download/action-items', requireAuth, requireRole('equity_lead'), async (req, res) => {
  const rows = await query('SELECT id,title,owner,status,priority,due_date,progress FROM action_items ORDER BY due_date ASC NULLS LAST');
  res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="action-items.csv"'); res.send(toCSV(rows));
});
router.get('/download/audit-log', requireAuth, requireRole('equity_lead'), async (req, res) => {
  const rows = await query('SELECT id,event_type,details,user_id,created_at FROM audit_log ORDER BY created_at DESC LIMIT 500');
  res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="audit-log.csv"'); res.send(toCSV(rows));
});
router.get('/download/community-profiles', requireAuth, requireRole('equity_lead'), async (req, res) => {
  const rows = await query('SELECT id,community_name,category,priority_flag FROM community_profiles ORDER BY community_name ASC');
  res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="community-profiles.csv"'); res.send(toCSV(rows));
});

module.exports = router;
