import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronRight, CircleHelp, ClipboardCheck, Clock3, ExternalLink, FileMusic,
  GraduationCap, LayoutDashboard, LogOut, Menu, Music2, Pencil, Plus,
  RefreshCw, Search, Settings, ShieldCheck, Sparkles, TrendingUp, Users, X
} from "lucide-react";
import "./styles.css";

const cfg = window.APP_CONFIG || {};
const SESSION_KEY = "kc_session";

function apiConfigured() {
  return Boolean(cfg.API_URL && !cfg.API_URL.includes("YOUR_DEPLOYMENT_ID"));
}

async function api(action, payload = {}) {
  if (!apiConfigured()) throw new Error("NOT_CONFIGURED");
  const res = await fetch(cfg.API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload })
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("BAD_RESPONSE"); }
  if (!res.ok || data.success === false) throw new Error(data.error || "API_ERROR");
  return data;
}


function useSession() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
  });
  const save = (value) => {
    setSession(value);
    if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
  };
  return [session, save];
}

function App() {
  const [session, setSession] = useSession();
  const [view, setView] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };

  const load = async () => {
    if (!session) return;
    setLoading(true);
    try {
      if (!apiConfigured()) {
        setData(null);
      } else {
        const result = await api("bootstrap", { token: session.token });
        setData(result.data);
      }
    } catch (e) {
      if (e.message === "UNAUTHORIZED" || e.message === "SESSION_EXPIRED") {
        setSession(null);
        notify("Your session expired. Please sign in again.");
      } else {
        notify("Could not refresh data. Please try again.");
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [session?.token]);

  if (!session) return <Login onLogin={setSession} />;
  if (!data) return <LoadingScreen />;

  const role = session.user.role;
  const nav = role === "teacher"
    ? [["dashboard","Overview",LayoutDashboard],["students","Students",Users],["grades","Weekly grades",ClipboardCheck],["practice","Practice",CalendarDays],["syllabus","Syllabus",BookOpen],["resources","Resources",FileMusic]]
    : [["dashboard","Overview",LayoutDashboard],["syllabus","Syllabus",BookOpen],["resources","Resources",FileMusic],["progress","Progress",TrendingUp]];

  const logout = () => setSession(null);
  const updateData = (patch) => setData(d => ({...d, ...patch}));

  return (
    <div className="app-shell">
      <Sidebar user={session.user} nav={nav} view={view} setView={setView}
        mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} logout={logout}/>
      <main className="main">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="Open menu"><Menu size={21}/></button>
          <div>
            <div className="eyebrow">{cfg.STUDIO_NAME || "PIANO STUDIO"}</div>
            <h1>{role === "teacher" ? pageTitle(view) : `Online Portal`}</h1>
          </div>
          <div className="top-actions">
            <button className="icon-btn" onClick={load} title="Refresh"><RefreshCw size={17}/></button>
            <span className="role-pill"><ShieldCheck size={14}/>{role}</span>
            <div className="avatar">{session.user.name?.slice(0,1).toUpperCase()}</div>
          </div>
        </header>
        <div className="content">
          {view==="dashboard" && <Dashboard user={session.user} data={data} role={role} session={session} setView={setView} notify={notify} updateData={updateData}/>}
          {view==="progress" && <Progress data={data}/>}
          {view==="syllabus" && <Syllabus data={data} role={role} session={session} update={updateData} notify={notify}/>}
          {view==="resources" && <Resources data={data}/>}
          {view==="students" && <Students data={data} session={session} notify={notify}/>}
          {view==="grades" && <WeeklyGrades data={data} session={session} update={updateData} notify={notify}/>}
          {view==="practice" && <PracticeTeacher data={data} session={session} notify={notify}/>}
        </div>
      </main>
      {loading && <div className="sync-pill"><RefreshCw size={13}/> Updating…</div>}
      {toast && <div className="toast"><Check size={16}/>{toast}</div>}
    </div>
  );
}

function pageTitle(v) {
  return ({dashboard:"Studio overview",students:"Students",grades:"Weekly grades",practice:"Practice & sign-offs",syllabus:"Syllabus",resources:"Resources"}[v] || "Studio");
}

function Login({onLogin}) {
  const [code,setCode] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);

  const submit = async () => {
    setError("");
    const value = code.trim();
    if (!value) return setError("Enter your private access code.");
    setBusy(true);
    try {
      if (!apiConfigured()) {
        setError("The portal is not connected yet. Set API_URL in public/config.js after deploying the Google Apps Script.");
        return;
      }
      const result = await api("login", { accessCode:value });
      onLogin({ token:result.token, user:result.user, expiresAt:result.expiresAt });
    } catch (e) {
      const msg = e.message === "RATE_LIMITED" ? "Too many attempts. Please wait a few minutes."
        : e.message === "INVALID_CODE" ? "That access code is not recognised."
        : "Sign-in failed. Please try again.";
      setError(msg);
    } finally { setBusy(false); }
  };

  return <div className="login-page">
    <div className="login-art">
      <div className="brand-mark"><Music2 size={22}/></div>
      <div className="login-quote">"The piano is a mirror. Every small improvement becomes part of the music."</div>
      <div className="mini-keyboard">{Array.from({length:14},(_,i)=><span key={i} className={i%3===1||i%3===2?"black-key":""}></span>)}</div>
    </div>
    <div className="login-panel">
      <div className="brand"><span className="brand-icon"><Music2 size={18}/></span><span>{cfg.STUDIO_NAME || "STS Keyboard"}</span></div>
      <div className="login-copy"><p className="eyebrow">PRIVATE PIANO STUDIO PORTAL</p><h1>Your music, your progress.</h1><p>Sign in with the private access code supplied by your teacher.</p></div>
      <label htmlFor="access">Access code</label>
      <div className="code-input"><ShieldCheck size={18}/><input id="access" value={code} onChange={e=>setCode(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="e.g. K7M4-XP92" autoFocus autoComplete="one-time-code"/></div>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="primary-btn wide" onClick={submit} disabled={busy}>{busy ? "Signing in…" : <>Continue <ArrowRight size={17}/></>}</button>
      <p className="login-help"><CircleHelp size={15}/> Need a new code? Contact your teacher.</p>
      <div className="security-note"><ShieldCheck size={16}/><div><strong>Private by design</strong><br/>Student data is stored in your private Google Sheet and is only returned after the access code is verified.</div></div>
    </div>
  </div>;
}

function LoadingScreen(){ return <div className="loading-screen"><div className="brand-icon"><Music2 size={20}/></div><span>Loading studio…</span></div>; }

function Sidebar({user,nav,view,setView,mobileOpen,setMobileOpen,logout}) {
  return <aside className={`sidebar ${mobileOpen?"open":""}`}>
    <div className="sidebar-brand"><span className="brand-icon"><Music2 size={18}/></span><span>{cfg.STUDIO_NAME || "STS Keyboard"}</span>
      <button className="icon-btn close-mobile" onClick={()=>setMobileOpen(false)}><X size={19}/></button></div>
    <div className="studio-label">PIANO STUDIO</div>
    <nav>{nav.map(([id,label,Icon])=><button className={view===id?"active":""} key={id} onClick={()=>{setView(id);setMobileOpen(false)}}><Icon size={17}/>{label}</button>)}</nav>
    <div className="sidebar-bottom"><div className="user-mini"><div className="avatar small">{user.name?.slice(0,1).toUpperCase()}</div><div><strong>{user.name}</strong><span>{user.role}</span></div></div>
      <button className="logout-btn" onClick={logout}><LogOut size={15}/> Sign out</button></div>
  </aside>;
}

function Dashboard({user,data,role,session,setView,notify,updateData}) {
  if(role==="teacher") return <TeacherDashboard data={data} setView={setView}/>;
  const grades = data.grades || [];
  const average = grades.length ? (grades.reduce((a,g)=>a+Number(g.grade),0)/grades.length).toFixed(1) : "—";
  const practice = data.practice || {days:[],target:5,week:1};
  const practiced = practice.days.filter(Boolean).length;
  const signed = (data.signoffs||[]).some(s=>Number(s.week)===Number(practice.week));
  return <div className="page">
    <section className="hero">
      <div><p className="eyebrow">WEEK {practice.week}</p><h2>Keep the momentum going.</h2><p>Your next lesson is a chance to turn this week's small wins into confident playing.</p>
        <button className="secondary-btn" onClick={()=>setView("syllabus")}>View this week's goals <ArrowRight size={15}/></button></div>
      <div className="hero-score"><span>Current average</span><strong>{average}<small>/10</small></strong><em>Across {grades.length} graded lessons</em></div>
    </section>
    <div className="stats-grid">
      <Stat icon={TrendingUp} label="Latest grade" value={grades.at(-1)?.grade ?? "—"} note="out of 10"/>
      <Stat icon={CalendarDays} label="Practice" value={`${practiced}/${practice.target}`} note="days this week"/>
      <Stat icon={BookOpen} label="Syllabus" value={`${practice.week}/${data.syllabus.length}`} note="weeks mapped"/>
      <Stat icon={ClipboardCheck} label="Parent sign-off" value={signed?"Done":"Pending"} note={signed?"This week":"Awaiting confirmation"}/>
    </div>
    <div className="grid-2">
      <Panel title="This week's practice" kicker="WEEKLY ROUTINE">
        <div className="practice-days">{practice.days.map((done,i)=><div key={i} className={done?"day done":"day"}><span>{["M","T","W","T","F","S","S"][i]}</span><div>{done?<Check size={15}/>:<span className="dot"/>}</div></div>)}</div>
        <div className="practice-summary"><strong>{practiced} of {practice.target} days</strong><span>{practice.tasks || "Technique, scales and repertoire as set by your teacher."}</span></div>
        {user.role==="parent" && !signed && <button className="primary-btn" onClick={async()=>{
          try {
            const r = await api("signoffPractice",{token:session.token,week:practice.week});
            updateData(r.data);
            notify("Practice sign-off submitted.");
          } catch { notify("Could not submit the sign-off. Please try again."); }
        }}>Confirm practice for this week <Check size={15}/></button>}
        {signed && <div className="signed-banner"><CheckCircle2 size={17}/><span>Practice confirmed for week {practice.week}.</span></div>}
      </Panel>
      <Panel title="Recent lessons" kicker="GRADE HISTORY">
        <div className="grade-list">{grades.slice(-5).reverse().map(g=><div className="grade-row" key={`${g.week}-${g.grade}`}><div><strong>Week {g.week}</strong><span>{g.comment || "Lesson grade"}</span></div><b>{g.grade}<small>/10</small></b></div>)}</div>
        <button className="text-btn" onClick={()=>setView("progress")}>See full progress <ArrowRight size={14}/></button>
      </Panel>
    </div>
  </div>;
}

function TeacherDashboard({data,setView}) {
  const students=(data.students||[]).filter(s=>s.active!==false);
  const pending=students.filter(s=>!s.signed).length;
  const avg=students.length?(students.reduce((a,s)=>a+Number(s.latest||0),0)/students.length).toFixed(1):"—";
  return <div className="page">
    <div className="page-intro"><div><p className="eyebrow">STUDIO OVERVIEW</p><h2>A clear view of the week.</h2><p>Keep grades, practice and syllabus updates in one place.</p></div>
      <button className="primary-btn" onClick={()=>setView("grades")}><Plus size={16}/> Enter weekly grades</button></div>
    <div className="stats-grid">
      <Stat icon={Users} label="Active students" value={students.length} note="in your studio"/>
      <Stat icon={TrendingUp} label="Studio average" value={avg} note="latest grades"/>
      <Stat icon={ClipboardCheck} label="Sign-offs pending" value={pending} note="this week"/>
      <Stat icon={CalendarDays} label="Current week" value={data.currentWeek || students[0]?.week || "—"} note="academic year"/>
    </div>
    <div className="grid-2">
      <Panel title="Students needing attention" kicker="THIS WEEK">
        <div className="attention-list">{students.filter(s=>!s.signed||Number(s.practice||0)<3).slice(0,5).map(s=><div className="attention-row" key={s.id}><Avatar name={s.name}/><div><strong>{s.name}</strong><span>{s.practice||0} practice days · grade {s.latest??"—"}</span></div><span className={s.signed?"tag success":"tag warning"}>{s.signed?"Signed":"Pending"}</span></div>)}</div>
        {!pending && <div className="empty"><CheckCircle2 size={18}/> All practice sign-offs are complete.</div>}
      </Panel>
      <Panel title="Quick actions" kicker="TEACHER TOOLS">
        <div className="quick-actions"><button onClick={()=>setView("students")}><Users size={18}/><span>Manage students<small>Add, edit or deactivate</small></span><ChevronRight size={16}/></button>
          <button onClick={()=>setView("syllabus")}><BookOpen size={18}/><span>Update syllabus<small>Edit yearly learning plan</small></span><ChevronRight size={16}/></button>
          <button onClick={()=>setView("practice")}><CalendarDays size={18}/><span>Review practice<small>See sign-offs and routines</small></span><ChevronRight size={16}/></button></div>
      </Panel>
    </div>
  </div>;
}

function Stat({icon:Icon,label,value,note}){return <div className="stat-card"><div className="stat-icon"><Icon size={17}/></div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>;}
function Panel({title,kicker,children}){return <section className="panel"><div className="panel-head"><div><span className="eyebrow">{kicker}</span><h3>{title}</h3></div></div>{children}</section>}
function Avatar({name}){return <div className="avatar small">{name?.slice(0,1).toUpperCase()}</div>}

function Progress({data}) {
  const grades=data.grades||[];
  return <div className="page"><div className="page-intro"><div><p className="eyebrow">PROGRESS</p><h2>Every lesson adds up.</h2><p>Your recent grades and teacher feedback, all in one place.</p></div></div>
    <div className="grid-2">
      <Panel title="Lesson grade history" kicker="PAST LESSONS"><div className="grade-list large">{grades.slice().reverse().map(g=><div className="grade-row" key={`${g.week}-${g.grade}`}><div><strong>Week {g.week}</strong><span>{g.comment || "Lesson grade"}</span></div><b>{g.grade}<small>/10</small></b></div>)}</div></Panel>
      <Panel title="Trend" kicker="AT A GLANCE"><div className="chart">{grades.map((g,i)=><div className="chart-col" key={i}><span className="chart-value">{g.grade}</span><div className="bar" style={{height:`${Math.max(12,Number(g.grade)*8)}%`}}/><span>W{g.week}</span></div>)}</div></Panel>
    </div>
  </div>;
}

function Syllabus({data,role,session,update,notify}) {
  const [open,setOpen]=useState(Number(data.currentWeek||data.syllabus?.at(-1)?.week||1));
  const [editing,setEditing]=useState(null);
  const list=data.syllabus||[];
  const save = async (item) => {
    try { const r=await api("upsertSyllabus",{token:session.token,item}); update({syllabus:r.syllabus}); notify("Syllabus saved."); setEditing(null); }
    catch { notify("Could not save syllabus."); }
  };
  return <div className="page"><div className="page-intro"><div><p className="eyebrow">ANNUAL PLAN</p><h2>The year at a glance.</h2><p>Students and parents can follow the full learning journey; teachers can keep it current.</p></div>{role==="teacher"&&<button className="primary-btn" onClick={()=>setEditing({week:list.length+1,term:1,title:"New week",piece:"",objectives:["New objective"]})}><Plus size={16}/> Add week</button>}</div>
    <div className="syllabus-list">{list.map(item=><div className="syllabus-item" key={item.week}>
      <button className="syllabus-head" onClick={()=>setOpen(open===item.week?null:item.week)}><div className="week-number">W{item.week}</div><div className="syllabus-title"><strong>{item.title}</strong><small>Term {item.term} · {item.piece || "—"}</small></div>{role==="teacher"&&<span className="edit-hint" onClick={e=>{e.stopPropagation();setEditing({...item})}}><Pencil size={14}/></span>}{open===item.week?<ChevronDown size={18}/>:<ChevronRight size={18}/>}</button>
      {open===item.week&&<div className="syllabus-body"><div><span className="eyebrow">GOALS</span><ul>{(item.objectives||[]).map((o,i)=><li key={i}><Check size={13}/>{o}</li>)}</ul></div></div>}
    </div>)}</div>
    {editing&&<SyllabusModal item={editing} setItem={setEditing} onClose={()=>setEditing(null)} onSave={save}/>}
  </div>;
}

function SyllabusModal({item,setItem,onClose,onSave}) {
  const objectives=(item.objectives||[]).join("\n");
  const [obj,setObj]=useState(objectives);
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><h3>Edit syllabus week</h3><button className="icon-btn" onClick={onClose}><X/></button></div>
    <div className="form-grid"><label>Week<input type="number" value={item.week} onChange={e=>setItem({...item,week:Number(e.target.value)})}/></label><label>Term<input type="number" value={item.term} onChange={e=>setItem({...item,term:Number(e.target.value)})}/></label></div>
    <label>Title<input value={item.title} onChange={e=>setItem({...item,title:e.target.value})}/></label>
    <label>Piece / repertoire<input value={item.piece||""} onChange={e=>setItem({...item,piece:e.target.value})}/></label>
    <label>Objectives <small>one per line</small><textarea value={obj} onChange={e=>setObj(e.target.value)}/></label>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" onClick={()=>onSave({...item,objectives:obj.split("\n").map(s=>s.trim()).filter(Boolean)})}>Save week</button></div>
  </div></div>;
}

function Resources({data}) {
  return <div className="page"><div className="page-intro"><div><p className="eyebrow">TRAINING LIBRARY</p><h2>Practice smarter.</h2><p>Resources your teacher has selected for technique, reading and repertoire.</p></div></div>
    <div className="resource-grid">{(data.resources||[]).map(r=><div className="resource-card" key={r.id}><div className="resource-icon"><FileMusic size={19}/></div><span className="resource-type">{r.type}</span><h3>{r.title}</h3><p>{r.description}</p><a href={r.url||"#"} target="_blank" rel="noreferrer">Open resource <ExternalLink size={13}/></a></div>)}</div>
  </div>;
}

function Students({data,session,notify}) {
  const [q,setQ]=useState(""); const [selected,setSelected]=useState(data.students?.[0]?.id||null);
  const [modal,setModal]=useState(null);
  const list=(data.students||[]).filter(s=>(s.name||"").toLowerCase().includes(q.toLowerCase()));
  const student=list.find(s=>s.id===selected)||list[0];
  const save = async (item) => {
    try { await api("upsertStudent",{token:session.token,item}); notify("Student saved."); setModal(null); window.location.reload(); }
    catch { notify("Could not save student."); }
  };
  return <div className="page"><div className="page-intro"><div><p className="eyebrow">STUDIO ROSTER</p><h2>Your students.</h2><p>Manage active students, levels and access.</p></div><button className="primary-btn" onClick={()=>setModal({id:"",name:"",level:"Grade 1",parent:"",active:true})}><Plus size={16}/> Add student</button></div>
    <div className="student-admin"><section className="table-card"><div className="table-tools"><div className="search"><Search size={14}/><input placeholder="Search students…" value={q} onChange={e=>setQ(e.target.value)}/></div><span>{list.length} students</span></div>
      {list.map(s=><button className={`table-row ${student?.id===s.id?"selected":""}`} key={s.id} onClick={()=>setSelected(s.id)}><Avatar name={s.name}/><div><strong>{s.name}</strong><span>{s.parent || "No parent listed"}</span></div><span>{s.level}</span><b>{s.latest??"—"}</b><span className={s.signed?"tag success":"tag warning"}>{s.signed?"Signed":"Pending"}</span></button>)}
    </section>
    {student&&<aside className="student-detail"><div className="detail-head"><Avatar name={student.name}/><div><h3>{student.name}</h3><p>{student.level} · Week {student.week}</p></div></div><div className="detail-stats"><div><span>Latest grade</span><strong>{student.latest??"—"}</strong></div><div><span>Practice</span><strong>{student.practice??0} days</strong></div></div><div className="detail-block"><span className="eyebrow">PARENT</span><strong>{student.parent||"—"}</strong></div><div className="detail-block"><span className="eyebrow">PRACTICE SIGN-OFF</span><strong>{student.signed?"Complete":"Pending"}</strong><p>Teacher view of this week's confirmation.</p></div><button className="secondary-btn wide" onClick={()=>setModal({...student})}><Pencil size={14}/> Edit student</button>
      <button className="danger-btn wide" onClick={async()=>{
        if(!confirm(`Deactivate ${student.name}?`)) return;
        try { await api("deleteStudent",{token:session.token,studentId:student.id}); notify("Student deactivated."); window.location.reload(); }
        catch { notify("Could not deactivate student."); }
      }}><X size={14}/> Deactivate student</button></aside>}
    </div>{modal&&<StudentModal item={modal} setItem={setModal} onClose={()=>setModal(null)} onSave={save}/>}</div>;
}

function StudentModal({item,setItem,onClose,onSave}){return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><h3>{item.id?"Edit student":"Add student"}</h3><button className="icon-btn" onClick={onClose}><X/></button></div>
  <label>Student ID<input value={item.id} onChange={e=>setItem({...item,id:e.target.value.trim().toUpperCase()})} disabled={Boolean(item.id)}/></label>
  <label>Student name<input value={item.name} onChange={e=>setItem({...item,name:e.target.value})}/></label>
  <div className="form-grid"><label>Level<input value={item.level||""} onChange={e=>setItem({...item,level:e.target.value})}/></label><label>Parent name<input value={item.parent||""} onChange={e=>setItem({...item,parent:e.target.value})}/></label></div>
  <label className="check-label"><input type="checkbox" checked={item.active!==false} onChange={e=>setItem({...item,active:e.target.checked})}/> Active student</label>
  <p className="form-note">Access codes should be generated and stored by the Google Apps Script setup/admin flow rather than placed in the public website.</p>
  <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" onClick={()=>onSave(item)}>Save student</button></div>
</div></div>;}

function WeeklyGrades({data,session,update,notify}) {
  const students=(data.students||[]).filter(s=>s.active!==false); const [week,setWeek]=useState(data.currentWeek||students[0]?.week||1);
  const [rows,setRows]=useState(students.map(s=>({id:s.id,grade:s.latest??"",comment:""})));
  const save=async()=>{
    try { const r=await api("saveWeeklyGrades",{token:session.token,week,grades:rows}); update({students:r.students}); notify("Weekly grades saved."); }
    catch { notify("Could not save grades."); }
  };
  return <div className="page"><div className="page-intro"><div><p className="eyebrow">ASSESSMENT</p><h2>Weekly grades.</h2><p>Enter this week's grades and feedback in one pass.</p></div><button className="primary-btn" onClick={save}><Check size={16}/> Save grades</button></div>
    <div className="week-selector"><label>Week <select value={week} onChange={e=>setWeek(Number(e.target.value))}>{Array.from({length:52},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label></div>
    <section className="table-card"><div className="grade-table-head"><span>Student</span><span>Grade /10</span><span>Feedback</span></div>{rows.map((r,i)=><div className="grade-table-row" key={r.id}><div className="student-cell"><Avatar name={students[i]?.name}/><div><strong>{students[i]?.name}</strong><small>{students[i]?.level}</small></div></div><input className="grade-input" type="number" min="0" max="10" step=".5" value={r.grade} onChange={e=>setRows(rows.map((x,j)=>j===i?{...x,grade:e.target.value}:x))}/><input className="comment-input" placeholder="Short teacher feedback…" value={r.comment} onChange={e=>setRows(rows.map((x,j)=>j===i?{...x,comment:e.target.value}:x))}/></div>)}</section>
  </div>;
}

function PracticeTeacher({data,session,notify}) {
  const students=(data.students||[]).filter(s=>s.active!==false);
  return <div className="page"><div className="page-intro"><div><p className="eyebrow">PRACTICE</p><h2>Who's keeping the habit?</h2><p>Review practice activity and parent confirmations for the current week.</p></div></div>
    <section className="table-card practice-card">{students.map(s=><div className="practice-teacher-row" key={s.id}><Avatar name={s.name}/><div><strong>{s.name}</strong><span>{s.practice||0} practice days this week</span></div><div className="mini-progress"><span style={{width:`${Math.min(100,((s.practice||0)/5)*100)}%`}}/></div><span className={s.signed?"tag success":"tag warning"}>{s.signed?"Parent signed":"Awaiting sign-off"}</span></div>)}</section>
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
