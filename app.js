const ACE_APP_VERSION='2.4';
const seedQuestions=[
 {id:1,level:"Secondary",category:"UTME",subject:"English",q:"Choose the word nearest in meaning to 'rapid'.",options:["Slow","Swift","Weak","Late"],answer:1,explanation:"Swift means moving quickly.",image:"",topic:"Vocabulary"},
 {id:2,level:"Secondary",category:"UTME",subject:"Mathematics",q:"If 2x + 6 = 14, what is x?",options:["2","3","4","5"],answer:2,explanation:"Subtract 6 and divide by 2: x = 4.",image:"",topic:"Algebra"},
 {id:3,level:"Tertiary",category:"100 Level",subject:"General",q:"Which data structure follows FIFO?",options:["Stack","Queue","Tree","Graph"],answer:1,explanation:"A queue follows First-In, First-Out (FIFO).",image:"",topic:"Data Structures"},
 {id:4,level:"Primary",category:"UTME",subject:"Mathematics",q:"What is 12 × 5?",options:["50","55","60","65"],answer:2,explanation:"12 multiplied by 5 equals 60.",image:"",topic:"Arithmetic"}
];
let questions=JSON.parse(localStorage.getItem("ace_questions")||"null")||seedQuestions;
questions=questions.map(normalizeStoredQuestion);
questions=questions.filter(x=>x.level!=="Primary"&&!['Common Entrance','BECE','IELTS','SAT'].includes(x.category));
questions.forEach(x=>{if(!x.topic)x.topic="Uncategorized";});
let users=JSON.parse(localStorage.getItem("ace_users")||"[]");
let current=null;
let sharedChallenges=JSON.parse(localStorage.getItem("ace_challenges")||"[]").map(c=>({...c,leaderboardLocked:!!c.leaderboardLocked}));
let quizResults=JSON.parse(localStorage.getItem("ace_quiz_results")||"[]");
let isAdmin=false;
let quiz=null;
let serverReady=false;
let questionDeleteSelection=new Set();
let questionLongPressTimer=null;
let questionLongPressTriggered=false;
let suppressQuestionClick=false;
let lastExamReview=null;

async function api(action,body={},options={}){
 const headers={"Content-Type":"application/json",...(options.headers||{})};
 const r=await fetch('/api/data',{method:'POST',headers,credentials:'same-origin',body:JSON.stringify({action,...body})});
 const data=await r.json().catch(()=>({ok:false,error:'Invalid server response'}));
 if(!r.ok||data.ok===false)throw new Error(data.error||`Request failed (${r.status})`);
 return data;
}
async function loadSharedData(){
 try{
   const r=await fetch('/api/data',{cache:'no-store',credentials:'same-origin'}); const data=await r.json();
   if(!r.ok||data.ok===false)throw new Error(data.error||'Unable to load shared data');
   serverReady=true;
   if(Array.isArray(data.questions)){
     questions=data.questions.map(normalizeStoredQuestion).filter(x=>x.level!=="Primary"&&!['Common Entrance','BECE','IELTS','SAT'].includes(x.category));
     questions.forEach(x=>{if(!x.topic)x.topic="Uncategorized";});
     localStorage.setItem("ace_questions",JSON.stringify(questions));
   }
   if(Array.isArray(data.challenges)){sharedChallenges=data.challenges.map(c=>({...c,leaderboardLocked:!!c.leaderboardLocked}));localStorage.setItem("ace_challenges",JSON.stringify(sharedChallenges));localStorage.setItem("ace_quiz_results",JSON.stringify(quizResults));}
   if(Array.isArray(data.results)){quizResults=data.results;localStorage.setItem("ace_quiz_results",JSON.stringify(quizResults));}
   current=data.user||null;
   isAdmin=!!data.isAdmin;
   return data;
 }catch(e){
   console.warn('Shared storage unavailable:',e.message);
   serverReady=false;
   return null;
 }
}
async function syncLocalBankAfterAdminLogin(){
 try{
   const data=await loadSharedData();
   if(data && data.questions===null && questions.length){
     await api('bootstrap',{questions,challenges:sharedChallenges});
     await loadSharedData();
   }else if(data && Array.isArray(data.questions)){
     questions=data.questions.map(normalizeStoredQuestion);
     saveLocal();
   }
 }catch(e){alert(`The shared question bank could not be synchronized: ${e.message}`)}
}
function saveLocal(){sharedChallenges=sharedChallenges.map(c=>({...c,leaderboardLocked:!!c.leaderboardLocked}));localStorage.setItem("ace_questions",JSON.stringify(questions));localStorage.setItem("ace_users",JSON.stringify(users));localStorage.setItem("ace_challenges",JSON.stringify(sharedChallenges));localStorage.setItem("ace_quiz_results",JSON.stringify(quizResults));}
function save(){
 saveLocal();
 if(serverReady && isAdmin){
   api('saveQuestions',{questions}).catch(e=>console.error('Question sync failed:',e));
   api('saveChallenges',{challenges:sharedChallenges}).catch(e=>console.error('Challenge sync failed:',e));
 }
}
function app(){return document.getElementById("app")}

// Theme management: follow the device automatically until the user chooses a theme manually.
const THEME_STORAGE_KEY="ace_theme_preference";
function getSystemTheme(){return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";}
function getThemePreference(){const saved=localStorage.getItem(THEME_STORAGE_KEY);return saved==="dark"||saved==="light"?saved:"auto";}
function applyTheme(){
  const preference=getThemePreference();
  const theme=preference==="auto"?getSystemTheme():preference;
  document.documentElement.dataset.theme=theme;
  document.documentElement.style.colorScheme=theme;
  updateThemeButton();
}
function updateThemeButton(){
  const button=document.getElementById("themeToggle");
  if(!button)return;
  const preference=getThemePreference();
  const theme=document.documentElement.dataset.theme||getSystemTheme();
  button.textContent=theme==="dark"?"☀️":"🌙";
  button.setAttribute("aria-label",theme==="dark"?"Switch to light mode":"Switch to dark mode");
  button.title=preference==="auto"
    ? `Automatic mode · currently ${theme} (tap to set ${theme==="dark"?"light":"dark"})`
    : `Manual ${theme} mode (tap to switch)`;
}
function toggleTheme(){
  const current=document.documentElement.dataset.theme||getSystemTheme();
  localStorage.setItem(THEME_STORAGE_KEY,current==="dark"?"light":"dark");
  applyTheme();
}
function resetThemeToAuto(){localStorage.removeItem(THEME_STORAGE_KEY);applyTheme();}
function addThemeButton(){
  if(document.getElementById("themeToggle"))return;
  const button=document.createElement("button");
  button.id="themeToggle";
  button.className="theme-toggle";
  button.type="button";
  button.onclick=toggleTheme;
  document.body.appendChild(button);
  updateThemeButton();
}
const themeMediaQuery=window.matchMedia?window.matchMedia("(prefers-color-scheme: dark)"):null;
if(themeMediaQuery){
  const handleSystemThemeChange=()=>{if(getThemePreference()==="auto")applyTheme();};
  if(themeMediaQuery.addEventListener)themeMediaQuery.addEventListener("change",handleSystemThemeChange);
  else if(themeMediaQuery.addListener)themeMediaQuery.addListener(handleSystemThemeChange);
}
applyTheme();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}

function showHome(){
 if(!current){showAuth();return}
 app().innerHTML=`<section class="hero"><div class="hero-title"><img src="assets/ace-academy-logo.png" alt="ACE Academy logo"><div><h1>ACE Quiz Arena</h1><p class="theme-hint">Theme follows your device automatically. Use the moon/sun button to override it.</p></div></div><p>A complete quiz platform for Secondary and Tertiary learners. Practice at your pace, sit timed exams, or take standard Quiz Challenges.</p></section>
 <h2 class="section-title">Choose your level</h2><div class="grid">
 <div class="card"><h3>🎓 Tertiary</h3><p>100 Level, 200 Level and 300 Level quizzes across subjects.</p><button class="btn" onclick="showCategory('Tertiary')">Explore Tertiary</button></div>
 <div class="card"><h3>📚 Secondary</h3><p>UTME, WASSCE and other secondary-level quizzes.</p><button class="btn" onclick="showCategory('Secondary')">Explore Secondary</button></div>
 <div class="card"><h3>🏆 Quiz Challenge</h3><p>Standard quizzes created and timed by ACE Quiz Arena.</p><button class="btn green" onclick="showChallenges()">Take a Challenge</button></div></div>`;
 addThemeButton();
 updateThemeButton();
 updateAuth();
}
function showLevels(){showCategory("Secondary")}
function showCategory(level){
 const cats=[...new Set(questions.filter(x=>x.level===level).map(x=>x.category))];
 app().innerHTML=`<h1>${level} Section</h1><p class="muted">Choose an examination or level.</p><div class="grid">${cats.map(c=>`<div class="card"><h3>${escapeHtml(c)}</h3><p>${questions.filter(x=>x.level===level&&x.category===c).length} question(s) available.</p><button class="btn" onclick="setupQuiz('${escapeHtml(level)}','${escapeHtml(c)}')">Start</button></div>`).join("")}</div>`;
}
function setupQuiz(level,category){
 const isUTME=category==='UTME';
 const isYearAware=['UTME','WASSCE'].includes(category);
 const years=isYearAware?[...new Set(questions.filter(x=>x.level===level&&x.category===category&&String(x.year||'').trim()).map(x=>String(x.year).trim()))].sort((a,b)=>Number(b)-Number(a)):[];
 const subjects=[...new Set(questions.filter(x=>x.level===level&&x.category===category).map(x=>x.subject||"General"))].sort();
 if(!subjects.length){alert("No questions are available for this quiz.");return}
 quizPicker={level,category,isUTME,yearsSelected:isYearAware?[]:[],subjectsSelected:[],maxSubjects:isUTME?4:subjects.length};
 app().innerHTML=`<h1>${escapeHtml(category)} Quiz</h1>
 <div class="card quiz-setup">
   <div class="form">
     <label>Mode</label><select id="mode" onchange="toggleQuizTime();updateUTMEModeUI()">${isUTME?`<option value="practice">Practice Mode</option><option value="exam">Exam Mode</option><option value="standard_utme">Standard UTME Mode</option>`:`<option value="practice">Practice Mode</option><option value="exam">Exam Mode</option>`}</select>
     ${isYearAware?`<div class="utme-selection-card"><button class="btn" type="button" onclick="openExamYearPicker()">☰ Select ${escapeHtml(category)} Years & Subjects</button><p id="examYearSelectionSummary" class="muted">No year or subject selected yet.</p></div>`:`<div id="subjectSelection"><label>Subjects <span class="muted">(select one or more)</span></label>
     <div class="subject-list">${subjects.map(sub=>`<label class="pick-item"><input type="checkbox" class="quiz-subject" value="${escapeHtml(sub)}" onchange="updateQuizSubjectSelection('${escapeHtml(level)}','${escapeHtml(category)}',${subjects.length})"><span><b>${escapeHtml(sub)}</b><small>${questions.filter(x=>x.level===level&&x.category===category&&(x.subject||"General")===sub).length} question(s)</small></span></label>`).join("")}</div></div>`}
     <div id="quizSubjectControls"></div>
     <div id="quizTime"><label>Time limit (minutes) — required for Exam Mode</label><input id="mins" type="number" min="1" value="10"></div>
     <br><button class="btn" onclick="prepareQuiz('${escapeHtml(level)}','${escapeHtml(category)}')">Begin Quiz</button>
   </div>
 </div>
 ${isYearAware?`<div id="examYearPickerModal" class="modal-backdrop" onclick="closeExamYearPicker(event)"><div class="modal-card" onclick="event.stopPropagation()"><div class="modal-head"><h2>Select ${escapeHtml(category)} Years & Subjects</h2><button class="modal-close" type="button" onclick="closeExamYearPicker()">×</button></div><div class="select-all-bar"><label class="pick-item"><input id="selectAllExamYears" type="checkbox" onchange="toggleAllExamYears(this.checked)"><span><b>Select All Years</b></span></label></div><h3>Exam years</h3><div class="year-list">${years.length?years.map(y=>`<label class="pick-item"><input type="checkbox" class="exam-year" value="${escapeHtml(y)}" onchange="updateExamYearSelection()"><span><b>${escapeHtml(y)}</b></span></label>`).join(''):`<p class="muted">No ${escapeHtml(category)} question years have been added yet.</p>`}</div><h3>Subjects ${isUTME?'<span class="muted">(Standard UTME: choose 3 subjects; English is automatically included)</span>':''}</h3><div class="subject-list">${subjects.map(sub=>`<label class="pick-item"><input type="checkbox" class="exam-subject" value="${escapeHtml(sub)}" onchange="updateExamSubjectSelection()"><span><b>${escapeHtml(sub)}</b></span></label>`).join('')}</div><p id="examYearPickerMessage" class="notice" style="display:none"></p><div class="form-actions"><button class="btn" type="button" onclick="applyExamYearPicker()">Apply Selection</button><button class="btn light" type="button" onclick="closeExamYearPicker()">Cancel</button></div></div></div>`:''}`;
 toggleQuizTime();if(isYearAware)updateExamSubjectSelection();if(isUTME)updateUTMEModeUI();
}
let quizPicker={level:'',category:'',isUTME:false,yearsSelected:[],subjectsSelected:[],maxSubjects:4};
function openExamYearPicker(){
 const modal=document.getElementById('examYearPickerModal');if(!modal)return;
 document.querySelectorAll('.exam-year').forEach(x=>x.checked=quizPicker.yearsSelected.includes(x.value));
 document.querySelectorAll('.exam-subject').forEach(x=>x.checked=quizPicker.subjectsSelected.includes(x.value));
 if(quizPicker.isUTME&&isStandardUTMEMode()){const english=document.querySelector('.exam-subject[value="English"]');if(english)english.checked=true;}
 updateExamYearSelection();updateExamSubjectSelection();modal.classList.add('open');
}
function closeExamYearPicker(e){if(e&&e.target!==e.currentTarget)return;document.getElementById('examYearPickerModal')?.classList.remove('open')}
function toggleAllExamYears(checked){document.querySelectorAll('.exam-year').forEach(x=>x.checked=checked);updateExamYearSelection()}
function updateExamYearSelection(){
 quizPicker.yearsSelected=[...document.querySelectorAll('.exam-year:checked')].map(x=>x.value);
 const all=document.getElementById('selectAllExamYears');if(all)all.checked=quizPicker.yearsSelected.length>0&&quizPicker.yearsSelected.length===document.querySelectorAll('.exam-year').length;
 updateExamAvailability();
}
function updateExamSubjectSelection(){
 const boxes=[...document.querySelectorAll('.exam-subject')];let checked=boxes.filter(x=>x.checked);
 if(quizPicker.isUTME&&isStandardUTMEMode()){const english=boxes.find(x=>x.value==='English');if(english)english.checked=true;checked=boxes.filter(x=>x.checked);const nonEnglish=checked.filter(x=>x.value!=='English');if(nonEnglish.length>3)nonEnglish.slice(3).forEach(x=>x.checked=false);checked=boxes.filter(x=>x.checked);}
 else if(quizPicker.isUTME&&checked.length>4){checked[checked.length-1].checked=false;checked=boxes.filter(x=>x.checked);}
 quizPicker.subjectsSelected=checked.map(x=>x.value);updateExamAvailability();
}
function updateExamAvailability(){
 const years=quizPicker.yearsSelected,selected=quizPicker.subjectsSelected;
 document.querySelectorAll('.exam-subject').forEach(box=>{const count=questions.filter(x=>x.level===quizPicker.level&&x.category===quizPicker.category&&(x.subject||'General')===box.value&&(!years.length||years.includes(String(x.year||'').trim()))).length;const small=box.parentElement.querySelector('small');if(small)small.textContent=`${count} question(s)`;box.disabled=count===0||(quizPicker.isUTME&&isStandardUTMEMode()&&box.value==='English');});
 const summary=document.getElementById('examYearSelectionSummary');if(summary)summary.textContent=`Years: ${years.length?years.join(', '):'None'} · Subjects: ${selected.length?selected.join(', '):'None'}`;
}
function showExamPickerMessage(msg){const el=document.getElementById('examYearPickerMessage');if(el){el.textContent=msg;el.style.display='block';setTimeout(()=>{if(el)el.style.display='none'},2500)}}
function applyExamYearPicker(){
 const years=[...document.querySelectorAll('.exam-year:checked')].map(x=>x.value),subjects=[...document.querySelectorAll('.exam-subject:checked')].map(x=>x.value);
 if(!years.length)return showExamPickerMessage(`Select at least one ${quizPicker.category} exam year.`);
 if(quizPicker.isUTME&&isStandardUTMEMode()){const nonEnglish=subjects.filter(x=>x!=='English');if(!subjects.includes('English')||nonEnglish.length!==3)return showExamPickerMessage('Standard UTME requires English plus exactly 3 other subjects.');}
 else if(!subjects.length)return showExamPickerMessage(`Select at least one ${quizPicker.category} subject.`);
 quizPicker.yearsSelected=years;quizPicker.subjectsSelected=subjects;document.getElementById('examYearPickerModal')?.classList.remove('open');
 updateYearAwareSubjectControls();
 const summary=document.getElementById('examYearSelectionSummary');if(summary)summary.textContent=`Years: ${years.join(', ')} · Subjects: ${subjects.join(', ')}`;
}
function updateYearAwareSubjectControls(){
 const controls=document.getElementById('quizSubjectControls');if(!controls)return;const standard=quizPicker.isUTME&&isStandardUTMEMode();
 controls.innerHTML=quizPicker.subjectsSelected.map(subject=>quizSubjectControlHTML(quizPicker.level,quizPicker.category,subject,quizPicker.yearsSelected,standard)).join('');
 quizPicker.subjectsSelected.forEach(subject=>renderTopicsForSubject(quizPicker.level,quizPicker.category,subject,quizPicker.yearsSelected,standard));
}
function openUTMEPicker(){
 const modal=document.getElementById('utmePickerModal');if(!modal)return;
 document.querySelectorAll('.utme-year').forEach(x=>x.checked=quizPicker.yearsSelected.includes(x.value));
 document.querySelectorAll('.utme-subject').forEach(x=>x.checked=quizPicker.subjectsSelected.includes(x.value));
 if(isStandardUTMEMode()){
   const english=document.querySelector('.utme-subject[value="English"]');
   if(english)english.checked=true;
 }
 updateUTMEYearSelection();updateUTMEModeUI();modal.classList.add('open');
}
function closeUTMEPicker(e){if(e&&e.target!==e.currentTarget)return;document.getElementById('utmePickerModal')?.classList.remove('open')}
function toggleAllUTMEYears(checked){document.querySelectorAll('.utme-year').forEach(x=>x.checked=checked);updateUTMEYearSelection()}
function updateUTMEYearSelection(){
 const years=[...document.querySelectorAll('.utme-year:checked')].map(x=>x.value);
 quizPicker.yearsSelected=years;
 const all=document.getElementById('selectAllUTMEYears');if(all)all.checked=years.length>0&&years.length===document.querySelectorAll('.utme-year').length;
 updateUTMEAvailability();
}
function isStandardUTMEMode(){return quizPicker.isUTME&&document.getElementById('mode')?.value==='standard_utme'}
function updateUTMEModeUI(){
 const standard=isStandardUTMEMode();
 const time=document.getElementById('quizTime');
 if(time)time.style.display=standard?'none':(document.getElementById('mode')?.value==='exam'?'block':'none');
 if(document.querySelector('.exam-subject')){updateExamSubjectSelection();return;}
}
function updateUTMESubjectSelection(){
 const boxes=[...document.querySelectorAll('.utme-subject')];let checked=boxes.filter(x=>x.checked);
 if(isStandardUTMEMode()){
   const english=boxes.find(x=>x.value==='English');
   if(english)english.checked=true;
   checked=boxes.filter(x=>x.checked);
   const nonEnglish=checked.filter(x=>x.value!=='English');
   if(nonEnglish.length>3){nonEnglish.slice(3).forEach(x=>x.checked=false);checked=boxes.filter(x=>x.checked);showUTMEMessage('Standard UTME requires exactly 3 subjects in addition to English.');}
 }else if(checked.length>4){checked[checked.length-1].checked=false;checked=boxes.filter(x=>x.checked);showUTMEMessage('You can select a maximum of 4 subjects.');}
 quizPicker.subjectsSelected=checked.map(x=>x.value);updateUTMEAvailability();
}
function updateUTMEAvailability(){
 const years=quizPicker.yearsSelected, selected=quizPicker.subjectsSelected;
 document.querySelectorAll('.utme-subject').forEach(box=>{const count=questions.filter(x=>x.level==='Secondary'&&x.category==='UTME'&&(x.subject||'General')===box.value&&(!years.length||years.includes(String(x.year||'').trim()))).length;const small=box.parentElement.querySelector('small');if(small)small.textContent=`${count} question(s)`;box.disabled=count===0 || (isStandardUTMEMode()&&box.value==='English');});
 const summary=document.getElementById('utmeSelectionSummary');if(summary)summary.textContent=`Years: ${years.length?years.join(', '):'None'} · Subjects: ${selected.length?selected.join(', '):'None'}`;
}
function showUTMEMessage(msg){const el=document.getElementById('utmePickerMessage');if(el){el.textContent=msg;el.style.display='block';setTimeout(()=>{if(el)el.style.display='none'},2500)}}
function applyUTMEPicker(){
 const years=[...document.querySelectorAll('.utme-year:checked')].map(x=>x.value),subjects=[...document.querySelectorAll('.utme-subject:checked')].map(x=>x.value);
 if(!years.length)return showUTMEMessage('Select at least one UTME year.');
 if(isStandardUTMEMode()){
   const nonEnglish=subjects.filter(x=>x!=='English');
   if(!subjects.includes('English')||nonEnglish.length!==3)return showUTMEMessage('Standard UTME requires English plus exactly 3 other subjects.');
 }else{
   if(!subjects.length)return showUTMEMessage('Select at least one UTME subject.');
   if(subjects.length===4&&!subjects.includes('English'))return showUTMEMessage('English must be one of the subjects when 4 UTME subjects are selected.');
 }
 quizPicker.yearsSelected=years;quizPicker.subjectsSelected=subjects;
 document.getElementById('utmePickerModal')?.classList.remove('open');
 updateUTMESubjectControls();
 const summary=document.getElementById('utmeSelectionSummary');if(summary)summary.textContent=`Years: ${years.join(', ')} · Subjects: ${subjects.join(', ')}`;
}
function updateUTMESubjectControls(){
 const controls=document.getElementById('quizSubjectControls');if(!controls)return;
 const standard=isStandardUTMEMode();
 controls.innerHTML=quizPicker.subjectsSelected.map(subject=>quizSubjectControlHTML('Secondary','UTME',subject,quizPicker.yearsSelected,standard)).join('');
 quizPicker.subjectsSelected.forEach(subject=>renderTopicsForSubject('Secondary','UTME',subject,quizPicker.yearsSelected,standard));
}
function toggleQuizTime(){const mode=document.getElementById('mode')?.value;const box=document.getElementById('quizTime');if(box)box.style.display=mode==='exam'?'block':'none'}
function updateQuizSubjectSelection(level,category,maxSubjects){
 const boxes=[...document.querySelectorAll('.quiz-subject')];let checked=boxes.filter(b=>b.checked);
 if(checked.length>maxSubjects){checked[checked.length-1].checked=false;checked=boxes.filter(b=>b.checked);alert(`You can select a maximum of ${maxSubjects} subject${maxSubjects===1?'':'s'}.`)}
 const controls=document.getElementById('quizSubjectControls');if(!controls)return;
 controls.innerHTML=checked.map(b=>quizSubjectControlHTML(level,category,b.value,[])).join('');
 checked.forEach(b=>renderTopicsForSubject(level,category,b.value,[]));
}
function quizSubjectControlHTML(level,category,subject,years=[],standard=false){
 const available=questions.filter(x=>x.level===level&&x.category===category&&(x.subject||'General')===subject&&(!years.length||years.includes(String(x.year||'').trim()))).length;
 const fixed=standard?(subject==='English'?60:40):null;
 return `<div class="quiz-subject-control" data-subject="${escapeHtml(subject)}"><h3>${escapeHtml(subject)}</h3><label>Number of questions</label><input class="subject-count" data-subject="${escapeHtml(subject)}" type="number" min="1" max="${standard?fixed:available}" value="${standard?fixed:Math.min(10,available)}" ${standard?'readonly':''}>${standard?`<p class="muted">Fixed for Standard UTME · ${fixed} questions · All topics selected</p>`:''}<div id="topics_${encodeURIComponent(subject)}" class="topic-picker"><p class="muted">Loading topics…</p></div></div>`;
}
function renderTopicsForSubject(level,category,subject,years=[],standard=false){
 const id='topics_'+encodeURIComponent(subject),box=document.getElementById(id);if(!box)return;
 const topicRows=questions.filter(x=>x.level===level&&x.category===category&&(x.subject||'General')===subject&&(!years.length||years.includes(String(x.year||'').trim())));
 const topics=[...new Set(topicRows.map(x=>String(x.topic||'').trim()).filter(Boolean))].sort();
 box.innerHTML=topics.length?`<label>Topics ${standard?'<span class="muted">(all selected)</span>':'<span class="muted">(required)</span>'}</label>${standard?'':`<label class="pick-item select-all-topic"><input type="checkbox" class="select-all-topic-checkbox" onchange="toggleAllTopics('${escapeHtml(id)}',this.checked)"><span><b>Select All</b></span></label>`}<div class="topic-list">${topics.map(t=>`<label class="pick-item"><input type="checkbox" class="quiz-topic" value="${escapeHtml(t)}" ${standard?'checked':''} ${standard?'disabled':''}><span>${escapeHtml(t)}</span></label>`).join('')}</div>`:`<label>Topics</label><p class="muted">No topic has been assigned to these questions yet.</p>`;
}
function toggleAllTopics(containerId,checked){const box=document.getElementById(containerId);box?.querySelectorAll('.quiz-topic').forEach(x=>x.checked=checked)}
function prepareQuiz(level,category){
 if(!current){showAuth("Please sign in or create an account before starting a quiz.");return}
 const isUTME=category==='UTME';
 const mode=document.getElementById('mode').value;
 const yearAware=['UTME','WASSCE'].includes(category);
 const subjects=yearAware?quizPicker.subjectsSelected:[...document.querySelectorAll('.quiz-subject:checked')].map(x=>x.value);
 const years=yearAware?quizPicker.yearsSelected:[];
 if(!subjects.length){alert('Select at least one subject.');return}
 if(yearAware&&!years.length){alert(`Select at least one ${category} exam year.`);return}
 if(isUTME&&mode==='standard_utme'){
   const nonEnglish=subjects.filter(s=>s!=='English');
   if(!subjects.includes('English')||nonEnglish.length!==3){alert('Standard UTME requires English plus exactly 3 other subjects.');return}
   const requiredPlans=subjects.map(subject=>({subject,count:subject==='English'?60:40,topics:'ALL',allTopics:true}));
   const pool=[];
   for(const plan of requiredPlans){
     const subjectPool=questions.filter(x=>x.level===level&&x.category===category&&(x.subject||'General')===plan.subject&&(!years.length||years.includes(String(x.year||'').trim())));
     if(subjectPool.length<plan.count){alert(`Standard UTME needs ${plan.count} questions for ${plan.subject}, but only ${subjectPool.length} are available in the selected year(s).`);return}
     pool.push(...subjectPool.sort(()=>Math.random()-.5).slice(0,plan.count).map(x=>({...x,quizSubject:plan.subject})));
   }
   quiz={pool,index:0,answers:{},mode:'standard_utme',seconds:120*60,title:'UTME Standard Mode',subjectPlans:requiredPlans,subjectIndex:0,level:'Secondary',category:'UTME'};
   renderQuestion();quiz.timer=setInterval(tick,1000);return;
 }
 if(isUTME&&subjects.length===4&&!subjects.includes('English')){alert('English must be one of the subjects when 4 UTME subjects are selected.');return}
 const subjectPlans=[];
 for(const subject of subjects){
   const countEl=document.querySelector(`.subject-count[data-subject="${CSS.escape(subject)}"]`);const count=Math.max(1,Number(countEl?.value||0));
   const topicBox=document.getElementById('topics_'+encodeURIComponent(subject));const topics=[...topicBox?.querySelectorAll('.quiz-topic:checked')||[]].map(x=>x.value);
   const allTopicCount=topicBox?.querySelectorAll('.quiz-topic').length||0;
   if(!topics.length){alert(`Select at least one topic for ${subject}.`);return}
   const available=questions.filter(x=>x.level===level&&x.category===category&&(x.subject||'General')===subject&&(!years.length||years.includes(String(x.year||'').trim())));
   if(count>available.length){alert(`There are not enough questions available for ${subject} in the selected year(s).`);return}
   subjectPlans.push({subject,count,topics,allTopics:topics.length===allTopicCount});
 }
 const mins=mode==='exam'?Number(document.getElementById('mins')?.value||0):null;if(mode==='exam'&&(!mins||mins<1)){alert('Enter a valid exam time limit.');return}
 const pool=[];
 for(const plan of subjectPlans){
   const subjectPool=questions.filter(x=>x.level===level&&x.category===category&&(x.subject||'General')===plan.subject&&(!years.length||years.includes(String(x.year||'').trim()))&&plan.topics.includes(String(x.topic||'').trim())).sort(()=>Math.random()-.5).slice(0,plan.count);
   if(subjectPool.length<plan.count){alert(`There are only ${subjectPool.length} questions matching the selected years and topics for ${plan.subject}. Reduce the question count or select more years/topics.`);return}
   pool.push(...subjectPool.map(x=>({...x,quizSubject:plan.subject})));
 }
 quiz={pool,index:0,answers:{},mode,seconds:mode==='exam'?mins*60:null,title:`${category} ${mode} quiz`,subjectPlans,subjectIndex:0,level,category};
 renderQuestion();if(quiz.seconds!==null)quiz.timer=setInterval(tick,1000);
}
function startQuiz(level,category,standard=null){
 if(standard){
   if(!current){showAuth("Please sign in or create an account before starting a quiz.");return}
   const pool=(standard.questions?.length?[...standard.questions]:questions.filter(x=>standard.questionIds?.includes(x.id))).sort(()=>Math.random()-.5).slice(0,standard.count);
   if(!pool.length)return alert('No questions are available for this challenge.');
   quiz={pool,index:0,answers:{},mode:'exam',seconds:standard.minutes*60,title:standard.title,subjectPlans:[]};renderQuestion();quiz.timer=setInterval(tick,1000);return;
 }
 setupQuiz(level,category);
}
function currentQuizSubject(){return quiz?.pool[quiz.index]?.quizSubject||quiz?.pool[quiz.index]?.subject||''}
function renderQuestion(){
 const x=quiz.pool[quiz.index],selected=quiz.answers[x.id],subject=currentQuizSubject();
 // Prevent the browser from carrying focus/highlight from the previous question.
 if(document.activeElement && document.activeElement.classList?.contains('option'))document.activeElement.blur();
 const isPractice=quiz.mode==='practice';
 const hasAnswer=selected!==undefined && selected!==null;
 app().innerHTML=`<div class="quiz"><div class="quiz-head"><div><span class="badge">${quiz.mode==='practice'?'Practice':'Exam'} Mode</span><h1>${escapeHtml(quiz.title)}</h1><p class="muted">${subject?`Subject: <strong>${escapeHtml(subject)}</strong> · `:''}Question ${quiz.index+1} of ${quiz.pool.length}</p></div>${quiz.seconds!==null?`<div class="timer" id="timer">${fmt(quiz.seconds)}</div>`:''}</div>
 <div class="question-box"><h2>${escapeHtml(x.q)}</h2>${x.image?`<div class="quiz-image"><img src="${x.image}" alt="Question diagram"></div>`:''}${x.options.map((o,i)=>{
   const correct=Number(i)===Number(x.answer);
   const wrongPicked=hasAnswer && Number(selected)===Number(i) && !correct;
   const cls=isPractice&&hasAnswer?(correct?'correct':wrongPicked?'wrong':''):(hasAnswer&&Number(selected)===Number(i)?'selected':'');
   const mark=isPractice&&hasAnswer?(correct?' ✓ Correct':wrongPicked?' ✕ Your answer':'') : '';
   return `<button class="option ${cls}" onclick="answer(${i})" ${isPractice&&hasAnswer?'disabled':''}>${String.fromCharCode(65+i)}. ${escapeHtml(optionText(o))}${mark?`<span class="answer-mark">${mark}</span>`:''}</button>`;
 }).join('')}
 ${isPractice&&hasAnswer?`${x.explanation||x.solutionImage?`<div class="explanation"><strong>Solution</strong>${x.solutionImage?`<div class="solution-image"><img src="${escapeHtml(x.solutionImage)}" alt="Solution image"></div>`:''}${x.explanation?`<p>${escapeHtml(x.explanation)}</p>`:''}</div>`:''}`:''}
 <br><button class="btn" onclick="nextQuestion()">${quiz.index===quiz.pool.length-1?'Finish':'Next'}</button></div></div>`;
}
function answer(i){
 if(quiz.mode==='practice' && quiz.answers[quiz.pool[quiz.index].id]!==undefined)return;
 quiz.answers[quiz.pool[quiz.index].id]=i;
 renderQuestion();
}
function nextQuestion(){if(quiz.index===quiz.pool.length-1){finishQuiz()}else{quiz.index++;renderQuestion()}}
function tick(){quiz.seconds--;let el=document.getElementById('timer');if(el)el.textContent=fmt(quiz.seconds);if(quiz.seconds<=0)finishQuiz()}
function finishQuiz(){
 if(!quiz)return;
 if(quiz.timer){clearInterval(quiz.timer);quiz.timer=null;}
 const total=quiz.pool.length;
 let score=0;
 const subjectScores={};
 quiz.pool.forEach(q=>{
   const subject=q.quizSubject||q.subject||'General';
   if(!subjectScores[subject])subjectScores[subject]={correct:0,total:0};
   subjectScores[subject].total++;
   if(Number(quiz.answers[q.id])===Number(q.answer)){score++;subjectScores[subject].correct++;}
 });
 const isStandard=quiz.mode==='standard_utme';
 if(isStandard){
   const rawTotal=180;
   const scaled=Math.round(score/rawTotal*400);
   const overallPercentage=Math.round(score/rawTotal*100);
   saveQuizResult(score,rawTotal,quiz);
   lastExamReview={pool:quiz.pool.map(q=>({...q})),answers:{...quiz.answers},title:quiz.title,returnLevel:'Secondary'};
   const ordered=['English',...Object.keys(subjectScores).filter(s=>s!=='English')];
   const rows=ordered.filter(s=>subjectScores[s]).map(subject=>{const s=subjectScores[subject];return `<div class="admin-item"><div><b>${escapeHtml(subject)}</b></div><span class="badge">${s.correct}/${s.total}.${Math.round(s.correct/s.total*100)}%</span></div>`}).join('');
   app().innerHTML=`<div class="card result-card"><h1>Quiz Complete</h1><p class="muted">UTME Standard Mode</p><div class="result-score"><strong>${scaled}/400</strong><span>${overallPercentage}%</span></div><h2>Subject Breakdown</h2>${rows}<div class="admin-item"><div><b>Total</b></div><span class="badge">${score}/180 · ${overallPercentage}%</span></div><div class="form-actions"><button class="btn" onclick="showExamCorrections()">Review Corrections</button><button class="btn" onclick="showCategory('Secondary')">Take Another Quiz</button><button class="btn light" onclick="showHome()">Home</button></div></div>`;
   quiz=null;return;
 }
 const percentage=total?Math.round(score/total*100):0;
 saveQuizResult(score,total,quiz);
 const rows=Object.entries(subjectScores).map(([subject,s])=>`<div class="admin-item"><div><b>${escapeHtml(subject)}</b></div><span class="badge">${s.correct}/${s.total} · ${Math.round(s.correct/s.total*100)}%</span></div>`).join('');
 const returnLevel=quiz.level||'Secondary';
 lastExamReview={pool:quiz.pool.map(q=>({...q})),answers:{...quiz.answers},title:quiz.title,returnLevel};
 app().innerHTML=`<div class="card result-card"><h1>Quiz Complete</h1><p class="muted">${escapeHtml(quiz.title||'Quiz')}</p><div class="result-score"><strong>${score}/${total}</strong><span>${percentage}%</span></div><h2>Subject Breakdown</h2>${rows||'<p class="muted">No questions were available.</p>'}<div class="form-actions"><button class="btn" onclick="showExamCorrections()">Review Corrections</button><button class="btn" onclick="showCategory(${JSON.stringify(returnLevel)})">Take Another Quiz</button><button class="btn light" onclick="showHome()">Home</button></div></div>`;
 quiz=null;
}
function showExamCorrections(){
 if(!lastExamReview)return;
 const {pool,answers,title,returnLevel}=lastExamReview;
 app().innerHTML=`<div class="card"><h1>Corrections</h1><p class="muted">${escapeHtml(title||'Exam')}</p>${pool.map((q,idx)=>{const picked=answers[q.id];return `<div class="correction-item"><div class="correction-title"><h3>Question ${idx+1}</h3><span class="${Number(picked)===Number(q.answer)?'status-correct':'status-wrong'}">${Number(picked)===Number(q.answer)?'Correct':'Incorrect'}</span></div><p><b>${escapeHtml(q.q)}</b></p><div class="correction-options">${q.options.map((o,i)=>{const correct=Number(i)===Number(q.answer),wrong=Number(picked)===Number(i)&&!correct;return `<div class="option ${correct?'correct':wrong?'wrong':''}">${String.fromCharCode(65+i)}. ${escapeHtml(optionText(o))}${correct?' <span class="answer-mark">✓ Correct answer</span>':''}${wrong?' <span class="answer-mark">✕ Your answer</span>':''}</div>`}).join('')}</div>${q.explanation||q.solutionImage?`<div class="explanation"><strong>Solution</strong>${q.solutionImage?`<div class="solution-image"><img src="${escapeHtml(q.solutionImage)}" alt="Solution image"></div>`:''}${q.explanation?`<p>${escapeHtml(q.explanation)}</p>`:''}</div>`:''}</div>`}).join('')}<div class="form-actions"><button class="btn" onclick="showCategory(${JSON.stringify(returnLevel)})">Take Another Quiz</button><button class="btn light" onclick="showHome()">Home</button></div></div>`;
}

function fmt(s){return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}

async function saveQuizResult(score,total,finishedQuiz){
 if(!finishedQuiz?.challengeId||!current)return;
 const spent=Math.max(0,(finishedQuiz.totalSeconds??(finishedQuiz.seconds??0))-Math.max(0,finishedQuiz.seconds??0));
 const result={id:'result_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),challengeId:String(finishedQuiz.challengeId),quizTitle:finishedQuiz.title||'Quiz',username:current.user||current.username||current.name||'Unknown',score,total,timeSpentSeconds:spent,completedAt:Date.now()};
 quizResults.push(result);localStorage.setItem('ace_quiz_results',JSON.stringify(quizResults));
 if(serverReady){try{const data=await api('saveResult',{result});if(Array.isArray(data.results)){quizResults=data.results;localStorage.setItem('ace_quiz_results',JSON.stringify(quizResults));}}catch(e){console.warn('Result sync failed:',e.message)}}
}
function formatSpent(seconds){seconds=Math.max(0,Number(seconds)||0);return `${Math.floor(seconds/60)}m ${String(seconds%60).padStart(2,'0')}s`}
function showCurrentQuizzes(){
 const challenges=getActiveChallenges();
 app().innerHTML=`<h1>Explore Current Quizzes</h1><p class="muted">Search a quiz, then search within it to locate questions. Locked quizzes cannot be started by users.</p><div class="card"><label>Search quizzes</label><input id="currentQuizSearch" placeholder="Search quiz titles..." oninput="renderCurrentQuizzes()"></div><div id="currentQuizList" style="margin-top:18px"></div><div class="form-actions"><button class="btn light" onclick="adminDashboard()">Back to Admin Dashboard</button></div>`;
 renderCurrentQuizzes();
}
function renderCurrentQuizzes(){
 const box=document.getElementById('currentQuizList');if(!box)return;
 const term=document.getElementById('currentQuizSearch')?.value.trim().toLowerCase()||'';
 const list=getActiveChallenges().filter(c=>!term||String(c.title||'').toLowerCase().includes(term));
 box.innerHTML=list.length?list.map(c=>`<div class="card current-quiz-card"><div class="section-head"><div><h2>${escapeHtml(c.title)}</h2><p class="muted">${c.count} questions · ${c.minutes} minutes · ${c.locked?'Locked':'Open'}</p></div><div class="form-actions"><button class="btn ${c.locked?'green':'red'}" onclick="toggleQuizLock('${escapeHtml(c.id)}')">${c.locked?'Open Quiz':'Lock Quiz'}</button><button class="btn ${c.leaderboardLocked?'green':'red'}" onclick="toggleLeaderboardLock('${escapeHtml(c.id)}')">${c.leaderboardLocked?'Open Leaderboard':'Lock Leaderboard'}</button><button class="btn light" onclick="openCurrentQuiz('${escapeHtml(c.id)}')">Explore Questions</button></div></div></div>`).join(''):'<div class="card"><p class="muted">No current quizzes matched your search.</p></div>';
}
function getChallengeQuestions(c){return c.questions?.length?[...c.questions]:questions.filter(q=>c.questionIds?.map(String).includes(String(q.id)));}
function openCurrentQuiz(id){
 const c=sharedChallenges.find(x=>String(x.id)===String(id));if(!c)return;
 const pool=getChallengeQuestions(c);window.currentQuizExploreId=c.id;
 app().innerHTML=`<h1>${escapeHtml(c.title)}</h1><p class="muted">${c.locked?'This quiz is locked.':'This quiz is open.'} · ${c.minutes} minute time limit · ${pool.length} question(s)</p><div class="card"><div class="question-bank-filters"><div><label>Search questions</label><input id="exploreQuestionSearch" placeholder="Type words from a question..." oninput="renderCurrentQuizQuestions()"></div><div><label>Filter by subject</label><select id="exploreSubject" onchange="renderCurrentQuizQuestions()"><option value="">All subjects</option>${[...new Set(pool.map(q=>q.subject||'General'))].sort().map(v=>`<option>${escapeHtml(v)}</option>`).join('')}</select></div><div><label>Filter by topic</label><select id="exploreTopic" onchange="renderCurrentQuizQuestions()"><option value="">All topics</option>${[...new Set(pool.map(q=>q.topic||'Uncategorized'))].sort().map(v=>`<option>${escapeHtml(v)}</option>`).join('')}</select></div></div></div><div id="currentQuizQuestionList" class="card" style="margin-top:18px"></div><div class="form-actions"><button class="btn light" onclick="showCurrentQuizzes()">← Back to Current Quizzes</button></div>`;
 renderCurrentQuizQuestions();
}
function renderCurrentQuizQuestions(){
 const box=document.getElementById('currentQuizQuestionList');if(!box)return;const c=sharedChallenges.find(x=>String(x.id)===String(window.currentQuizExploreId));if(!c)return;const pool=getChallengeQuestions(c);const term=document.getElementById('exploreQuestionSearch')?.value.trim().toLowerCase()||'',sub=document.getElementById('exploreSubject')?.value||'',topic=document.getElementById('exploreTopic')?.value||'';const list=pool.filter(q=>(!term||String(q.q||'').toLowerCase().includes(term))&&(!sub||String(q.subject||'General')===sub)&&(!topic||String(q.topic||'Uncategorized')===topic));box.innerHTML=`<h2>${list.length} Question(s)</h2>`+(list.length?list.map(q=>`<div class="admin-item"><div class="question-bank-copy"><b>${escapeHtml(q.q)}</b><br><span class="muted">${escapeHtml(q.subject||'General')} · ${escapeHtml(q.topic||'Uncategorized')}${q.year?` · ${escapeHtml(q.year)}`:''}</span></div><div class="form-actions admin-question-actions"><button class="btn" onclick="editCurrentQuizQuestion('${escapeHtml(q.id)}')">Edit</button><button class="btn red" onclick="deleteCurrentQuizQuestion('${escapeHtml(q.id)}')">Delete</button></div></div>`).join(''):'<p class="muted">No questions matched your filters.</p>');
}
function editCurrentQuizQuestion(id){
 const c=sharedChallenges.find(x=>String(x.id)===String(window.currentQuizExploreId));if(!c)return;const q=getChallengeQuestions(c).find(x=>String(x.id)===String(id));if(!q)return;
 const bankQ=questions.find(x=>String(x.id)===String(id));
 if(bankQ){editQuestion(id);return;}
 app().innerHTML=`<h1>Edit Quiz Question</h1><p class="muted">Changes apply to this challenge question.</p>${questionFormHTML('challengeEdit')}<div class="form-actions"><button class="btn green" onclick="saveCurrentQuizQuestion('${escapeHtml(id)}')">Save Changes</button><button class="btn light" onclick="openCurrentQuiz('${escapeHtml(c.id)}')">Cancel</button></div>`;fillQuestionForm('challengeEdit',q);
}
function saveCurrentQuizQuestion(id){const c=sharedChallenges.find(x=>String(x.id)===String(window.currentQuizExploreId));if(!c)return;const q=getChallengeQuestions(c).find(x=>String(x.id)===String(id));if(!q)return;const updated=readQuestionFields('challengeEdit');if(!updated.q||updated.options.some(o=>!o)||![0,1,2,3].includes(updated.answer)||!updated.category||!updated.subject)return alert('Complete the question fields, including subject and category.');Object.assign(q,updated,{id:q.id});save();openCurrentQuiz(c.id);}
function deleteCurrentQuizQuestion(id){
 const c=sharedChallenges.find(x=>String(x.id)===String(window.currentQuizExploreId));if(!c)return;
 const overlay=document.createElement('div');overlay.className='delete-popover-backdrop';overlay.innerHTML=`<div class="delete-confirm-card"><h2>Are you sure?</h2><p>This will remove the selected question from this quiz.</p><div class="delete-popover-actions"><button class="btn red" type="button" id="challengeDeleteYes">Yes</button><button class="btn light" type="button" id="challengeDeleteNo">No</button></div></div>`;document.body.appendChild(overlay);
 overlay.querySelector('#challengeDeleteNo').onclick=()=>overlay.remove();
 overlay.querySelector('#challengeDeleteYes').onclick=()=>{overlay.remove();if(c.questions?.length)c.questions=c.questions.filter(q=>String(q.id)!==String(id));else c.questionIds=(c.questionIds||[]).filter(qid=>String(qid)!==String(id));c.count=Math.min(Number(c.count)||0,getChallengeQuestions(c).length);save();openCurrentQuiz(c.id);};
}
function toggleQuizLock(id){const c=sharedChallenges.find(x=>String(x.id)===String(id));if(!c)return;c.locked=!c.locked;save();renderCurrentQuizzes();}
function toggleLeaderboardLock(id){const c=sharedChallenges.find(x=>String(x.id)===String(id));if(!c)return;c.leaderboardLocked=!c.leaderboardLocked;save();renderCurrentQuizzes();}
function showQuizResults(){
 app().innerHTML=`<h1>Check Quiz Results</h1><p class="muted">Select a quiz to see usernames, scores and time spent.</p><div class="card"><label>Search quizzes</label><input id="resultsQuizSearch" placeholder="Search quiz titles..." oninput="renderQuizResultsList()"></div><div id="quizResultsList" style="margin-top:18px"></div><div class="form-actions"><button class="btn light" onclick="adminDashboard()">Back to Admin Dashboard</button></div>`;renderQuizResultsList();
}
function renderQuizResultsList(){const box=document.getElementById('quizResultsList');if(!box)return;const term=document.getElementById('resultsQuizSearch')?.value.trim().toLowerCase()||'';const list=getActiveChallenges().filter(c=>!term||String(c.title||'').toLowerCase().includes(term));box.innerHTML=list.length?list.map(c=>{const rs=quizResults.filter(r=>String(r.challengeId)===String(c.id));return `<div class="card result-quiz-row" onclick="showQuizResultDetail('${escapeHtml(c.id)}')" style="cursor:pointer"><div class="section-head"><div><h2>${escapeHtml(c.title)}</h2><p class="muted">${rs.length} result(s) · ${c.minutes} minute limit</p></div><span class="badge">View Results →</span></div></div>`}).join(''):'<div class="card"><p class="muted">No quizzes matched your search.</p></div>';}
function showQuizResultDetail(id){const c=sharedChallenges.find(x=>String(x.id)===String(id));if(!c)return;const rs=quizResults.filter(r=>String(r.challengeId)===String(id)).sort((a,b)=>b.completedAt-a.completedAt);app().innerHTML=`<div class="printable-results"><h1>${escapeHtml(c.title)} — Results</h1><p class="muted">Quiz results · ${rs.length} result(s) · ${c.minutes} minute limit</p><div class="card"><div class="admin-item"><b>Username</b><b>Score</b><b>Time spent</b></div>${rs.length?rs.map(r=>`<div class="admin-item"><span>${escapeHtml(r.username)}</span><span class="badge">${r.score}/${r.total}</span><span>${formatSpent(r.timeSpentSeconds)}</span></div>`).join(''):'<p class="muted">No results have been recorded for this quiz yet.</p>'}</div></div><div class="form-actions result-page-actions"><button class="btn" onclick="printQuizResults()">🖨 Print results</button><button class="btn light" onclick="showQuizResults()">← Back to Results</button></div>`;}
function printQuizResults(){window.print();}
function showChallenges(){
 const saved=getActiveChallenges();
 const defaults=[
 {id:"default_utme",leaderboardLocked:false,title:"UTME Mathematics Challenge",level:"Secondary",category:"UTME",count:Math.min(2,questions.filter(x=>x.level==="Secondary"&&x.category==="UTME").length),minutes:5,questionIds:questions.filter(x=>x.level==="Secondary"&&x.category==="UTME").slice(0,2).map(x=>x.id)},
 {id:"default_100",leaderboardLocked:false,title:"100 Level General Challenge",level:"Tertiary",category:"100 Level",count:Math.min(1,questions.filter(x=>x.level==="Tertiary"&&x.category==="100 Level").length),minutes:3,questionIds:questions.filter(x=>x.level==="Tertiary"&&x.category==="100 Level").slice(0,1).map(x=>x.id)}
 ];
 const all=[...defaults,...saved];
 app().innerHTML=`<h1>🏆 Quiz Challenge</h1><p class="muted">New admin-created challenges stay on dashboards for 48 hours.</p><div class="grid">${all.map((c,i)=>`<div class="card"><h3>${escapeHtml(c.title)}</h3><p>${c.count} questions · ${c.minutes} minutes</p>${c.expiresAt?`<p class="muted">New challenge · ${formatRemaining(Math.max(0,c.expiresAt-Date.now()))} remaining</p>`:""}<div class="form-actions"><button class="btn green" onclick="startSavedChallenge(${i})">Start Challenge</button><button class="btn light" onclick="showChallengeLeaderboard('${escapeHtml(c.id)}')">${c.leaderboardLocked?'Leaderboard Locked':'Leaderboard'}</button></div></div>`).join("")}</div>`;
 window._challenges=all;
}
function startSavedChallenge(index){const c=window._challenges?.[index];if(!c)return;startChallenge(c);}
function showChallengeLeaderboard(id){
 const c=sharedChallenges.find(x=>String(x.id)===String(id))||window._challenges?.find(x=>String(x.id)===String(id));
 if(!c)return;
 if(c.leaderboardLocked){
   app().innerHTML=`<div class="card"><h1>${escapeHtml(c.title)} — Leaderboard</h1><div class="notice">The leaderboard for this quiz has been locked by the administrator.</div><div class="form-actions"><button class="btn light" onclick="showChallenges()">← Back to Challenges</button></div></div>`;return;
 }
 const rows=quizResults.filter(r=>String(r.challengeId)===String(id)).sort((a,b)=>Number(b.score||0)-Number(a.score||0)||Number(a.timeSpentSeconds||0)-Number(b.timeSpentSeconds||0));
 app().innerHTML=`<div class="card"><h1>${escapeHtml(c.title)} — Leaderboard</h1><p class="muted">Ranked by highest score, then fastest time.</p><div class="leaderboard-table"><div class="leaderboard-row leaderboard-head"><b>#</b><b>Username</b><b>Score</b><b>Time</b></div>${rows.length?rows.map((r,i)=>`<div class="leaderboard-row"><span>${i+1}</span><span>${escapeHtml(r.username)}</span><span class="badge">${r.score}/${r.total}</span><span>${formatSpent(r.timeSpentSeconds)}</span></div>`).join(''):'<p class="muted leaderboard-empty">No completed attempts yet.</p>'}</div><div class="form-actions"><button class="btn light" onclick="showChallenges()">← Back to Challenges</button></div></div>`;
}
function showAuth(msg=""){
 const hasAccounts=users.length>0;
 if(hasAccounts){
   loginForm(msg);
 }else{
   signupForm(msg||"Create your account to get started.");
 }
}
function loginForm(msg=""){
 app().innerHTML=`<div class="form"><h1>Sign In</h1>${msg?`<div class="notice">${escapeHtml(msg)}</div>`:""}<p class="muted">Returning users must sign in before entering ACE Quiz Arena.</p><label>Email</label><input id="email" type="email" autocomplete="email"><label>Password</label><div class="password-field"><input id="pass" type="password" autocomplete="current-password"><button class="password-toggle" type="button" onclick="togglePassword('pass',this)" aria-label="Show password" title="Show password">👁</button></div><br><br><button class="btn" onclick="login()">Sign In</button><p class="muted">New here? <button class="btn light" type="button" onclick="signupForm()">Create an account</button></p></div>`
}
function signupForm(msg=""){
 app().innerHTML=`<div class="form"><h1>Create Account</h1>${msg?`<div class="notice">${escapeHtml(msg)}</div>`:""}<p class="muted">New users must create an account before entering ACE Quiz Arena.</p><label>Full name</label><input id="name" autocomplete="name"><label>Username</label><input id="user" autocomplete="username"><label>Email</label><input id="email" type="email" autocomplete="email"><label>Password</label><div class="password-field"><input id="pass" type="password" autocomplete="new-password"><button class="password-toggle" type="button" onclick="togglePassword('pass',this)" aria-label="Show password" title="Show password">👁</button></div><br><br><button class="btn" onclick="signup()">Create Account</button><p class="muted">Already have an account? <button class="btn light" type="button" onclick="loginForm()">Sign In</button></p></div>`
}
function togglePassword(inputId, button){
 const input=document.getElementById(inputId);
 if(!input)return;
 const showing=input.type==='text';
 input.type=showing?'password':'text';
 button.textContent=showing?'👁':'🙈';
 button.setAttribute('aria-label',showing?'Show password':'Hide password');
 button.setAttribute('title',showing?'Show password':'Hide password');
}
async function signup(){
 const nameEl=document.getElementById("name"), userEl=document.getElementById("user"), emailEl=document.getElementById("email"), passEl=document.getElementById("pass");
 const u={name:nameEl.value.trim(),user:userEl.value.trim(),email:emailEl.value.trim().toLowerCase(),password:passEl.value};
 if(!u.name||!u.user||!u.email||!u.password)return alert("Please complete every field.");
 try{
   const data=serverReady?await api('signup',u):null;
   if(!data?.user)throw new Error("The account server is unavailable. Please try again.");
   const account=data.user;
   current={name:account.name,email:account.email};
   users=[...users.filter(x=>x.email!==account.email),account];
   saveLocal();showDashboard();
 }catch(e){alert(e.message)}
}
async function login(){
 const emailEl=document.getElementById("email"), passEl=document.getElementById("pass");
 const email=emailEl.value.trim().toLowerCase(), password=passEl.value;
 try{
   if(serverReady){
     const data=await api('login',{email,password});
     current={name:data.user.name,email:data.user.email};
     users=[...users.filter(x=>x.email!==data.user.email),data.user];
   }else{
     return alert("The account server is unavailable. Please reconnect to the internet and try again.");
   }
   saveLocal();showDashboard();
 }catch(e){alert(e.message)}
}
async function logout(){try{if(serverReady)await api("logout");}catch(e){console.warn(e.message)}current=null;isAdmin=false;saveLocal();showAuth("You have been signed out.");}
function getActiveChallenges(){
 const now=Date.now();
 const active=sharedChallenges.filter(c=>!c.expiresAt||c.expiresAt>now);
 if(active.length!==sharedChallenges.length){sharedChallenges=active;save();}
 return active;
}
function showDashboard(){
 if(!current){showAuth("Please sign in before entering your dashboard.");return}
 if(!current)return showAuth();
 const challenges=getActiveChallenges();
 const challengeHtml=challenges.length?`<section class="dashboard-challenges"><div class="section-head"><div><h2>🆕 New Challenges</h2><p class="muted">New challenges remain visible for 48 hours.</p></div><button class="btn light" onclick="showChallenges()">View All</button></div><div class="grid">${challenges.map((c,i)=>{const left=Math.max(0,c.expiresAt-Date.now());return `<div class="card challenge-card"><span class="badge">New</span><h3>${escapeHtml(c.title)}</h3><p>${c.count} questions · ${c.minutes} minutes</p><p class="muted">Available for ${formatRemaining(left)}.</p><button class="btn green" onclick="startChallengeById(${JSON.stringify(c.id)})">Start Challenge</button></div>`}).join("")}</div></section>`:`<section class="card"><h2>No new challenges right now</h2><p class="muted">Check back later for challenges created by the admin.</p></section>`;
 app().innerHTML=`<h1>Hello, ${escapeHtml(current.name.split(" ")[0])} 👋</h1><p class="muted">Your ACE Quiz Arena dashboard.</p>${challengeHtml}<br><div class="grid"><div class="card"><h3>Practice</h3><p>Choose a section and practice without a time limit.</p><button class="btn" onclick="showLevels()">Practice Now</button></div><div class="card"><h3>Quiz Challenge</h3><p>Take a standard timed challenge.</p><button class="btn green" onclick="showChallenges()">Challenges</button></div><div class="card"><h3>Account</h3><p>${escapeHtml(current.email)}</p><button class="btn red" onclick="logout()">Sign Out</button></div></div>`;
}
function formatRemaining(ms){const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);return h+"h "+m+"m"}
function startChallengeById(id){const c=getActiveChallenges().find(x=>String(x.id)===String(id));if(!c)return alert("This challenge has expired.");startChallenge(c);}
function startChallenge(c){if(c.locked)return alert('This quiz is currently locked by the administrator.');const pool=c.questions?.length?[...c.questions]:questions.filter(x=>c.questionIds.includes(x.id));if(!pool.length)return alert("The questions for this challenge are no longer available.");if(!current){showAuth("Please sign in or create an account before starting a challenge.");return}const chosen=pool.sort(()=>Math.random()-.5).slice(0,c.count);quiz={pool:chosen,index:0,answers:{},mode:"exam",seconds:c.minutes*60,totalSeconds:c.minutes*60,title:c.title,challengeId:c.id,level:c.level||chosen[0]?.level||'Secondary',category:c.category||chosen[0]?.category||''};renderQuestion();quiz.timer=setInterval(tick,1000);}
function showAdmin(){
 if(!current){showAuth("Please sign in before accessing the admin area.");return}
 app().innerHTML=`<div class="form admin-login-form"><h1>Admin Login</h1><p class="muted">Enter the administrator password to continue.</p><label for="adminPassword">Admin Password</label><input id="adminPassword" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Enter admin password"> <div class="form-actions"><button class="btn green" type="button" onclick="adminLogin()">Sign In as Admin</button><button class="btn light" type="button" onclick="showHome()">Cancel</button></div></div>`;
 setTimeout(()=>document.getElementById("adminPassword")?.focus(),0);
}
async function adminLogin(){
 const field=document.getElementById("adminPassword");
 const password=field ? field.value : "";
 if(!password){alert("Enter the administrator password.");field?.focus();return;}
 try{
   if(!serverReady)await loadSharedData();
   const data=await api('adminLogin',{password});
   isAdmin=!!data.isAdmin;
   await syncLocalBankAfterAdminLogin();
   adminDashboard();
 }catch(e){alert(e.message);field?.focus();}
}
function adminDashboard(){
 app().innerHTML=`<h1>Admin Dashboard</h1>
 <p class="muted">Manage ACE Quiz Arena from here.</p>
 <div class="grid">
   <div class="card"><h3>📚 Questions Bank</h3><p>Search, add, edit and delete questions stored in the original question bank.</p><button class="btn" onclick="showQuestionBank()">Open Questions Bank</button></div>
   <div class="card"><h3>🏆 Create Quiz Challenge</h3><p>Create standard quizzes using questions from the bank or upload new JSON files.</p><button class="btn green" onclick="showChallengeBuilder()">Create Quiz Challenge</button></div>
   <div class="card"><h3>🔎 Explore Current Quizzes</h3><p>Search challenge questions, edit or delete questions, and lock or open quizzes.</p><button class="btn" onclick="showCurrentQuizzes()">Explore Current Quizzes</button></div>
   <div class="card"><h3>📊 Check Quiz Results</h3><p>View results for every available quiz, including usernames, scores and time spent.</p><button class="btn" onclick="showQuizResults()">Check Quiz Results</button></div>
 </div>`;
}
function showQuestionBank(){
 questionDeleteSelection.clear();
 app().innerHTML=`<h1>Questions Bank</h1>
 <div class="card">
   <div class="question-bank-filters">
     <div><label>Search questions</label><input id="questionSearch" placeholder="Type words from a question..." oninput="renderQuestionBank()"></div>
     <div><label>Filter by section</label><select id="questionLevel" onchange="renderQuestionBank()"><option value="">All sections</option><option>Secondary</option><option>Tertiary</option></select></div>
     <div><label>Filter by exam type</label><select id="questionCategory" onchange="renderQuestionBank()"></select></div>
     <div><label>Filter by subject</label><select id="questionSubject" onchange="renderQuestionBank()"></select></div>
     <div><label>Filter by topic</label><select id="questionTopic" onchange="renderQuestionBank()"></select></div>
     <div><label>Exam year</label><select id="questionYearFilter" onchange="renderQuestionBank()"></select></div>
   </div>
   <div class="bank-actions">
     <button class="btn" onclick="showAddQuestion()">＋ Add Question</button>
     <button class="btn light" type="button" onclick="clearQuestionBankFilters()">Clear Filters</button>
     <button class="btn light" onclick="adminDashboard()">Back to Admin Dashboard</button>
   </div>
 </div>
 <div id="questionBankList" class="card" style="margin-top:18px"></div>
 <div id="questionDeleteOverlay"></div>`;
 renderQuestionBank();
}
function questionBankFilterOptions(field, selected){
 const values=[...new Set(questions.map(x=>String(x[field]??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
 const label=field==='category'?'All exam types':field==='subject'?'All subjects':'All topics';
 return `<option value="">${label}</option>`+values.map(v=>`<option value="${escapeHtml(v)}"${v===selected?' selected':''}>${escapeHtml(v)}</option>`).join('');
}
function questionMatchesBankFilters(x){
 const q=document.getElementById("questionSearch")?.value.trim().toLowerCase()||"";
 const level=document.getElementById("questionLevel")?.value||"";
 const category=document.getElementById("questionCategory")?.value||"";
 const subject=document.getElementById("questionSubject")?.value||"";
 const topic=document.getElementById("questionTopic")?.value||"";
 const year=document.getElementById("questionYearFilter")?.value||"";
 return (!q||String(x.q||'').toLowerCase().includes(q)) &&
   (!level||x.level===level) &&
   (!category||String(x.category||'')===category) &&
   (!subject||String(x.subject||'General')===subject) &&
   (!topic||String(x.topic||'Uncategorized')===topic) &&
   (!year||String(x.year||'')===year);
}
function renderQuestionBank(){
 const category=document.getElementById("questionCategory")?.value||"";
 const subject=document.getElementById("questionSubject")?.value||"";
 const topic=document.getElementById("questionTopic")?.value||"";
 const year=document.getElementById("questionYearFilter")?.value||"";
 const categorySelect=document.getElementById("questionCategory");
 const subjectSelect=document.getElementById("questionSubject");
 const topicSelect=document.getElementById("questionTopic");
 const yearSelect=document.getElementById("questionYearFilter");
 if(categorySelect)categorySelect.innerHTML=questionBankFilterOptions('category',category);
 if(subjectSelect)subjectSelect.innerHTML=questionBankFilterOptions('subject',subject);
 if(topicSelect)topicSelect.innerHTML=questionBankFilterOptions('topic',topic);
 if(yearSelect){const years=[...new Set(questions.map(x=>String(x.year||'').trim()).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));yearSelect.innerHTML='<option value="">All years</option>'+years.map(v=>`<option value="${escapeHtml(v)}"${v===year?' selected':''}>${escapeHtml(v)}</option>`).join('');}

 const filtered=questions.filter(questionMatchesBankFilters);
 const box=document.getElementById("questionBankList");
 if(!box)return;
 box.innerHTML=`<h2>${filtered.length} Question(s)</h2>`+(filtered.length ? filtered.map(x=>{
   const selected=questionDeleteSelection.has(String(x.id));
   return `<div class="admin-item question-bank-item${selected?' question-delete-selected':''}"
     data-question-id="${escapeHtml(x.id)}"
     onpointerdown="startQuestionLongPress(event,${JSON.stringify(x.id)})"
     onpointerup="endQuestionLongPress(event,${JSON.stringify(x.id)})"
     onpointercancel="cancelQuestionLongPress()"
     onpointerleave="cancelQuestionLongPress()"
     onclick="handleQuestionBankClick(event,${JSON.stringify(x.id)})">
     <div class="question-bank-copy"><b>${escapeHtml(x.q)}</b><br><span class="muted">${escapeHtml(x.level)} · ${escapeHtml(x.category)} · ${escapeHtml(x.subject||"General")} · ${escapeHtml(x.topic||"Uncategorized")}${x.year?` · ${escapeHtml(x.year)}`:""}</span><br><span class="badge">Correct: ${x.answer>=0&&x.answer<4?String.fromCharCode(65+x.answer):"Not set"}</span></div>
     <div class="form-actions admin-question-actions">
       <button class="btn" type="button" onclick="event.stopPropagation();editQuestion(${JSON.stringify(x.id)})">Edit</button>
       <button class="btn red" type="button" onclick="event.stopPropagation();confirmQuestionDelete([${JSON.stringify(String(x.id))}])">Delete</button>
     </div>
   </div>`;
 }).join("") : `<p class='muted'>No questions matched your filters.</p>`);
 renderQuestionDeletePopup();
}
function startQuestionLongPress(event,id){
 if(event.button!==undefined && event.button!==0)return;
 questionLongPressTriggered=false;
 cancelQuestionLongPress();
 questionLongPressTimer=setTimeout(()=>{
   questionLongPressTriggered=true;
   suppressQuestionClick=true;
   toggleQuestionDeleteSelection(id);
   openQuestionDeletePopup();
 },1500);
}
function endQuestionLongPress(event,id){
 if(questionLongPressTimer)clearTimeout(questionLongPressTimer);
 questionLongPressTimer=null;
 if(questionLongPressTriggered){
   event.preventDefault();
   questionLongPressTriggered=false;
   setTimeout(()=>{suppressQuestionClick=false;},0);
 }
}
function cancelQuestionLongPress(){
 if(questionLongPressTimer)clearTimeout(questionLongPressTimer);
 questionLongPressTimer=null;
}
function handleQuestionBankClick(event,id){
 if(questionLongPressTriggered||suppressQuestionClick){
   event.preventDefault();
   return;
 }
 if(questionDeleteSelection.size){
   const target=event.target;
   if(target.closest("button"))return;
   toggleQuestionDeleteSelection(id);
   openQuestionDeletePopup();
 }
}
function toggleQuestionDeleteSelection(id){
 const key=String(id);
 if(questionDeleteSelection.has(key))questionDeleteSelection.delete(key);
 else questionDeleteSelection.add(key);
}
function openQuestionDeletePopup(){
 renderQuestionDeletePopup(true);
}
function closeQuestionDeletePopup(clearSelection=true){
 cancelQuestionLongPress();
 if(clearSelection)questionDeleteSelection.clear();
 const overlay=document.getElementById("questionDeleteOverlay");
 if(overlay)overlay.innerHTML="";
 if(clearSelection)renderQuestionBank();
}
function renderQuestionDeletePopup(forceOpen=false){
 const overlay=document.getElementById("questionDeleteOverlay");
 if(!overlay)return;
 const open=forceOpen||questionDeleteSelection.size>0;
 if(!open){overlay.innerHTML="";return;}
 const count=questionDeleteSelection.size;
 overlay.innerHTML=`<div class="delete-popover-backdrop" onclick="closeQuestionDeletePopup()">
   <div class="delete-popover" onclick="event.stopPropagation()">
     <div class="delete-popover-head"><strong>Delete selected question(s)</strong><span>${count} selected</span></div>
     <div class="delete-popover-actions">
       <button class="btn red" type="button" onclick="confirmQuestionDelete([...questionDeleteSelection])">Delete</button>
       <button class="btn light" type="button" onclick="closeQuestionDeletePopup()">Cancel</button>
     </div>
     <button class="delete-secondary-action" type="button" onclick="openDeleteEntireSelection()">Delete an entire selection</button>
     <button class="delete-secondary-action danger" type="button" onclick="confirmDeleteAllQuestions()">Delete all</button>
     <p class="muted delete-help">Long-press another question for 1.5 seconds to add or remove it from the selection.</p>
   </div>
 </div>`;
}
function openDeleteEntireSelection(){
 const overlay=document.getElementById("questionDeleteOverlay");
 if(!overlay)return;
 const sectionValues=[...new Set(questions.map(x=>String(x.level||"").trim()).filter(Boolean))].sort();
 const categoryValues=[...new Set(questions.map(x=>String(x.category||"").trim()).filter(Boolean))].sort();
 const subjectValues=[...new Set(questions.map(x=>String(x.subject||"General").trim()).filter(Boolean))].sort();
 const topicValues=[...new Set(questions.map(x=>String(x.topic||"Uncategorized").trim()).filter(Boolean))].sort();
 const options=(id,values,placeholder)=>`<select id="${id}" multiple size="${Math.min(5,Math.max(2,values.length))}" aria-label="${placeholder}">${values.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}</select>`;
 overlay.innerHTML=`<div class="delete-popover-backdrop" onclick="closeQuestionDeletePopup()">
   <div class="delete-popover delete-selection-card" onclick="event.stopPropagation()">
     <div class="delete-popover-head"><strong>Delete an entire selection</strong></div>
     <p class="muted">Select one or more values in each field. Leave a field empty to include all values.</p>
     <label>Section${options("deleteSelectionLevel",sectionValues,"Sections")}</label>
     <label>Exam type(s)${options("deleteSelectionCategory",categoryValues,"Exam types")}</label>
     <label>Subject(s)${options("deleteSelectionSubject",subjectValues,"Subjects")}</label>
     <label>Topic(s)${options("deleteSelectionTopic",topicValues,"Topics")}</label>
     <div class="delete-popover-actions">
       <button class="btn red" type="button" onclick="confirmDeleteEntireSelection()">Delete</button>
       <button class="btn light" type="button" onclick="openQuestionDeletePopup()">Back</button>
     </div>
   </div>
 </div>`;
}
function getSelectedDeleteValues(id){
 return [...(document.getElementById(id)?.selectedOptions||[])].map(option=>option.value);
}
function getDeleteEntireSelectionIds(){
 const levels=getSelectedDeleteValues("deleteSelectionLevel");
 const categories=getSelectedDeleteValues("deleteSelectionCategory");
 const subjects=getSelectedDeleteValues("deleteSelectionSubject");
 const topics=getSelectedDeleteValues("deleteSelectionTopic");
 return questions.filter(x=>
   (!levels.length||levels.includes(String(x.level||""))) &&
   (!categories.length||categories.includes(String(x.category||""))) &&
   (!subjects.length||subjects.includes(String(x.subject||"General"))) &&
   (!topics.length||topics.includes(String(x.topic||"Uncategorized")))
 ).map(x=>String(x.id));
}
function confirmDeleteEntireSelection(){
 const ids=getDeleteEntireSelectionIds();
 if(!ids.length){alert("No questions match the selected criteria.");return;}
 confirmQuestionDelete(ids);
}
function confirmDeleteAllQuestions(){
 if(!questions.length){alert("The Questions Bank is already empty.");return;}
 confirmQuestionDelete(questions.map(x=>String(x.id)),"all");
}
function confirmQuestionDelete(ids,mode="selected"){
 const uniqueIds=[...new Set((ids||[]).map(String))];
 if(!uniqueIds.length)return;
 const overlay=document.getElementById("questionDeleteOverlay");
 if(!overlay)return;
 const label=mode==="all"?"all questions":`${uniqueIds.length} selected question${uniqueIds.length===1?"":"s"}`;
 overlay.innerHTML=`<div class="delete-popover-backdrop" onclick="closeQuestionDeletePopup()">
   <div class="delete-confirm-card" onclick="event.stopPropagation()">
     <h2>Are you sure</h2>
     <p>Do you want to delete ${escapeHtml(label)}?</p>
     <div class="delete-popover-actions">
       <button class="btn red" type="button" onclick='finalizeQuestionDelete(${JSON.stringify(uniqueIds)})'>Yes</button>
       <button class="btn light" type="button" onclick="openQuestionDeletePopup()">No</button>
     </div>
   </div>
 </div>`;
}
function finalizeQuestionDelete(ids){
 const idSet=new Set((ids||[]).map(String));
 questions=questions.filter(x=>!idSet.has(String(x.id)));
 questionDeleteSelection.clear();
 save();
 showQuestionBank();
}

function clearQuestionBankFilters(){
 ['questionSearch','questionLevel','questionCategory','questionSubject','questionTopic','questionYearFilter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
 renderQuestionBank();
}
function showAddQuestion(){
 app().innerHTML=`<h1>Add Questions to Bank</h1>
 <div class="card import-card">
   <h2>📁 Upload Question File</h2>
   <p class="muted">Choose a JSON or CSV file first, then select the section, exam type/class and subject. Topic is optional when every JSON question already has a topic. Images/diagrams already embedded in JSON are kept with their questions.</p>
   <label class="file-picker-label" for="questionFile">1. Choose your question file</label>
   <input id="questionFile" type="file" accept=".json,.csv,application/json,text/csv" onchange="importQuestionFile(event)">
   <div id="importControls" class="import-controls">
     <h3>2. Choose where these questions belong</h3>
     <div class="form-grid">
       <label>Category / Section
         <select id="importLevel">
           <option value="">Select category</option>
           <option value="Secondary">Secondary</option>
           <option value="Tertiary">Tertiary</option>
         </select>
       </label>
       <label>Exam Type / Class
         <select id="importExamType" onchange="toggleImportYearField()">
           <option value="">Select exam type</option>
           <option>UTME</option><option>WASSCE</option>
           <option>100 Level</option><option>200 Level</option><option>300 Level</option><option>Other</option>
         </select>
       </label>
       <label>Subject
         <input id="importSubject" placeholder="e.g. Mathematics">
       </label>
       <label>Topic (optional if each JSON question has a topic)
         <input id="importTopic" placeholder="e.g. Algebra">
       </label>
       <label id="importYearWrap">Exam year (UTME/WASSCE)
         <input id="importYear" type="number" min="1970" max="2100" placeholder="e.g. 2025">
       </label>
     </div>
     <div id="importStatus" class="import-status" role="status">Choose a JSON or CSV file, then provide the section, exam type/class and subject. Topic is optional when supplied in every JSON question. For UTME/WASSCE, an exam year is requested only when the JSON questions do not each contain one.</div>
     <div class="form-actions">
       <button class="btn green" type="button" onclick="confirmQuestionFileImport()">3. Import Questions to Bank</button>
       <button class="btn light" type="button" onclick="cancelQuestionFileImport()">Cancel</button>
     </div>
   </div>
 </div>
 <script></script>
 <h2>Or add a question manually</h2>${questionFormHTML("addQuestionToBank")}
 <div class="form-actions"><button class="btn green" type="button" onclick="addQuestionToBank()">⬆ Upload Question</button><button class="btn light" type="button" onclick="showQuestionBank()">← Back to Questions Bank</button></div>`;
 toggleImportYearField();toggleManualExamYearField("addQuestionToBank");
}
function questionFormHTML(prefix = "", includeBankCheckbox = false) {
  return `
    <div class="form">
      <label>Question<textarea id="${prefix}questionText" rows="3" placeholder="Enter the question"></textarea></label>
      <label>Option A<textarea id="${prefix}optionA" rows="2" placeholder="Enter option A"></textarea></label>
      <label>Option B<textarea id="${prefix}optionB" rows="2" placeholder="Enter option B"></textarea></label>
      <label>Option C<textarea id="${prefix}optionC" rows="2" placeholder="Enter option C"></textarea></label>
      <label>Option D<textarea id="${prefix}optionD" rows="2" placeholder="Enter option D"></textarea></label>
      <label>Correct answer<select id="${prefix}correctAnswer"><option value="">Select the correct option</option><option value="0">Option A</option><option value="1">Option B</option><option value="2">Option C</option><option value="3">Option D</option></select></label>
      <label>Level<select id="${prefix}questionLevel"><option value="Secondary">Secondary</option><option value="Tertiary">Tertiary</option></select></label>
      <label>Category / Exam Type<input id="${prefix}questionCategory" type="text" placeholder="e.g. UTME, WASSCE, 100 Level" oninput="toggleManualExamYearField('${prefix}')"></label>
      <label id="${prefix}questionYearWrap">Exam year<input id="${prefix}questionYear" type="number" min="1970" max="2100" placeholder="e.g. 2025"></label>
      <label>Subject<input id="${prefix}questionSubject" type="text" placeholder="e.g. Mathematics"></label>
      <label>Topic<input id="${prefix}questionTopic" type="text" placeholder="e.g. Algebra" required></label>
      <label>Explanation (optional)<textarea id="${prefix}questionExplanation" rows="3" placeholder="Optional explanation for the correct answer"></textarea></label>
      <label>Solution image (optional) <input id="${prefix}solutionImage" type="file" accept="image/*" onchange="previewQuestionImage(event,'${prefix}solutionImagePreview')"></label>
      <div id="${prefix}solutionImagePreview" class="image-preview"></div>
      <label>Question image / diagram <input id="${prefix}questionImage" type="file" accept="image/*" onchange="previewQuestionImage(event,'${prefix}imagePreview')"></label>
      <div id="${prefix}imagePreview" class="image-preview"></div>
      ${includeBankCheckbox?`<label class="check"><input id="${prefix}addToBank" type="checkbox"> Add uploaded questions to the original Questions Bank</label>`:""}
    </div>`;
}
function previewQuestionImage(event,targetId){const file=event.target.files?.[0],box=document.getElementById(targetId);if(!file||!box)return;const r=new FileReader();r.onload=()=>{box.innerHTML=`<img src="${r.result}" alt="Question diagram preview">`;box.dataset.dataUrl=r.result};r.readAsDataURL(file);}
function readQuestionFields(prefix = "") {
 const id=n=>document.getElementById(prefix+n);
 return {q:id("questionText")?.value.trim()||"",options:[id("optionA")?.value.trim()||"",id("optionB")?.value.trim()||"",id("optionC")?.value.trim()||"",id("optionD")?.value.trim()||""],answer:Number(id("correctAnswer")?.value),level:id("questionLevel")?.value||"",category:id("questionCategory")?.value.trim()||"",subject:id("questionSubject")?.value.trim()||"",topic:id("questionTopic")?.value.trim()||"",year:id("questionYear")?.value.trim()||"",explanation:id("questionExplanation")?.value.trim()||"",solutionImage:document.getElementById(prefix+"solutionImagePreview")?.dataset.dataUrl||"",image:document.getElementById(prefix+"imagePreview")?.dataset.dataUrl||""};
}
function toggleManualExamYearField(prefix=''){const cat=document.getElementById(prefix+'questionCategory')?.value.trim().toUpperCase()||'';const wrap=document.getElementById(prefix+'questionYearWrap');if(wrap)wrap.style.display=['UTME','WASSCE'].includes(cat)?'block':'none';}
function addQuestionToBank(){
 const x=readQuestionFields("addQuestionToBank");
 if(!x.q||x.options.some(o=>!o)||![0,1,2,3].includes(x.answer)||!x.category||!x.subject||!x.topic)return alert("Complete the question fields, including subject and topic.");
 if(['UTME','WASSCE'].includes(x.category.trim().toUpperCase())&&!/^\d{4}$/.test(x.year))return alert(`Enter the 4-digit ${x.category.trim().toUpperCase()} exam year.`);
 x.id=nextQuestionId();questions.push(x);save();showQuestionBank();
}
function nextQuestionId(){return questions.reduce((m,x)=>typeof x.id==='number'?Math.max(m,x.id):m,0)+1}
function importQuestionFile(event){
 const file=event.target.files?.[0],controls=document.getElementById("importControls"),status=document.getElementById("importStatus");
 if(!file||!controls||!status)return;
 status.textContent="Reading file…";
 const r=new FileReader();
 r.onload=()=>{
   try{
     let rows;
     if(file.name.toLowerCase().endsWith('.json')){
       const data=JSON.parse(r.result);
       rows=Array.isArray(data)?data:(Array.isArray(data.questions)?data.questions:[]);
     }else{rows=parseQuestionCSV(String(r.result));}
     if(!rows.length)throw new Error('No questions found in the file.');
     const imported=rows.map(normalizeImportedQuestion);
     const bad=imported.findIndex(x=>!x.q||x.options.length!==4||x.options.some(o=>!o)||![0,1,2,3].includes(x.answer));
     if(bad!==-1)throw new Error(`Question ${bad+1} must contain a question, four non-empty options, and a valid correct answer (A-D or 1-4).`);
     window.pendingQuestionFileImport=imported;
     window.pendingQuestionFileName=file.name;
     controls.style.display='block';
     toggleImportYearField();
     status.textContent=`✓ ${imported.length} question(s) loaded from ${file.name}. Select the category, exam type and subject, then click Import Questions to Bank.`;
   }catch(e){
     // Keep the selected file available so the user can correct the format or select another file.
     window.pendingQuestionFileImport=null;
     window.pendingQuestionFileName=file.name;
     controls.style.display='block';
     status.textContent='Could not import this file: '+e.message+' Choose another file or correct the file format and select it again.';
   }
 };
 r.readAsText(file);
}
function confirmQuestionFileImport(){
 const imported=window.pendingQuestionFileImport||[];
 const level=document.getElementById('importLevel')?.value||'';
 const examType=document.getElementById('importExamType')?.value||'';
 const subject=document.getElementById('importSubject')?.value.trim()||'';
 const topic=document.getElementById('importTopic')?.value.trim()||'';
 const year=document.getElementById('importYear')?.value.trim()||'';
 const status=document.getElementById('importStatus');
 if(!imported.length){if(status)status.textContent='Please select a valid JSON or CSV question file first. If a file was already selected, check the message above for the formatting problem.';return;}
 if(!level||!examType||!subject){if(status)status.textContent='Please select the level, exam type and subject before importing.';return;}
 const allHaveYears=imported.length>0&&imported.every(x=>/^\d{4}$/.test(String(x.year||'').trim()));
 if(!topic && !imported.every(x=>String(x.topic||'').trim())){if(status)status.textContent='Enter a topic, or include a topic in every JSON question.';return;}
 if(['UTME','WASSCE'].includes(examType)&&!allHaveYears&&!/^\d{4}$/.test(year)){if(status)status.textContent=`For ${examType}, enter the 4-digit exam year only when the JSON questions do not each contain their own year.`;return;}
 imported.forEach(x=>{x.id=nextQuestionId();x.level=level;x.category=examType;x.subject=subject;x.topic=topic||x.topic||'Uncategorized';x.examType=examType;if(['UTME','WASSCE'].includes(examType)&&!allHaveYears)x.year=year;});
 questions.push(...imported);save();window.pendingQuestionFileImport=null;
 const yearSummary=['UTME','WASSCE'].includes(examType)?` · Years: ${[...new Set(imported.map(x=>x.year).filter(Boolean))].join(', ')}`:'';
 if(status)status.textContent=`Imported ${imported.length} question(s) into ${level} → ${examType} → ${subject}${yearSummary}.`;
 setTimeout(showQuestionBank,600);
}
function toggleImportYearField(){const wrap=document.getElementById('importYearWrap'),type=document.getElementById('importExamType')?.value,imported=window.pendingQuestionFileImport||[],allHaveYears=imported.length>0&&imported.every(x=>/^\d{4}$/.test(String(x.year||'').trim()));if(wrap)wrap.style.display=['UTME','WASSCE'].includes(type)&&!allHaveYears?'block':'none';}
function cancelQuestionFileImport(){
 window.pendingQuestionFileImport=null;
 const controls=document.getElementById('importControls');
 const input=document.getElementById('questionFile');
 if(controls)controls.style.display='block';
 if(input)input.value='';
 const status=document.getElementById('importStatus');if(status)status.textContent='Choose a JSON or CSV file, then provide the section, exam type/class and subject. Topic is optional when supplied in every JSON question. For UTME/WASSCE, an exam year is requested only when the JSON questions do not each contain one.';
}
function optionText(value){
 if(value===null||value===undefined)return '';
 if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value).trim();
 if(typeof value==='object'){
   // Support common option-object formats produced by question converters.
   const nested=value.text??value.option??value.value??value.label??value.content??value.name;
   if(nested!==undefined)return optionText(nested);
 }
 return '';
}
function optionIsCorrect(value){
 if(!value||typeof value!=='object')return false;
 const flag=value.isCorrect??value.correct??value.is_correct??value.isAnswer??value.is_answer;
 return flag===true||String(flag??'').trim().toLowerCase()==='true';
}
function answerIndex(value, opts=[]){
 if(value&&typeof value==='object'){
   const nested=value.index??value.optionIndex??value.value??value.answer??value.correctAnswer??value.text??value.label;
   if(nested!==undefined)value=nested;
 }
 if(typeof value==='string'){
   const clean=value.trim().toUpperCase();
   const map={A:0,B:1,C:2,D:3,'OPTION A':0,'OPTION B':1,'OPTION C':2,'OPTION D':3};
   if(map[clean]!==undefined)return map[clean];
   const numeric=Number(clean);
   if(Number.isFinite(numeric))value=numeric;
   else{
     const match=opts.findIndex(o=>optionText(o).toUpperCase()===clean);
     if(match>=0)return match;
   }
 }
 if(typeof value==='number'){
   if(value>=1&&value<=4)return value-1;
   if(value>=0&&value<4)return value;
 }
 return -1;
}
function normalizeStoredQuestion(x){
 if(!x||typeof x!=='object')return x;
 const rawOpts=Array.isArray(x.options)?x.options:[x.optionA??x.option_a??x.A??x.a,x.optionB??x.option_b??x.B??x.b,x.optionC??x.option_c??x.C??x.c,x.optionD??x.option_d??x.D??x.d];
 const opts=rawOpts.slice(0,4).map(optionText);
 let answer=answerIndex(x.answer??x.correctAnswer??x.correct_answer??x.correct??'',rawOpts);
 if(answer<0)answer=rawOpts.findIndex(optionIsCorrect);
 return {...x,options:opts,answer,topic:String(x.topic??x.topicName??'').trim()||'Uncategorized',year:String(x.year??x.examYear??'').trim()};
}
function normalizeImportedQuestion(x){
 const opts=Array.isArray(x.options)?x.options:[
   x.optionA??x.option_a??x.A??x.a,
   x.optionB??x.option_b??x.B??x.b,
   x.optionC??x.option_c??x.C??x.c,
   x.optionD??x.option_d??x.D??x.d
 ];
 let a=answerIndex(x.answer??x.correctAnswer??x.correct_answer??x.correct??'',opts);
 if(a<0)a=opts.findIndex(optionIsCorrect);
 return {
   q:String(x.q??x.question??x.questionText??'').trim(),
   options:opts.map(optionText),
   answer:a,
   level:String(x.level??'Secondary').trim(),
   category:String(x.category??x.examType??x.exam_type??'').trim(),
   subject:String(x.subject??'General').trim(),
   topic:String(x.topic??x.topicName??'').trim(),
   explanation:String(x.explanation??'').trim(),
   image:String(x.image??x.diagram??x.imageUrl??x.image_url??'').trim(),
   solutionImage:String(x.solutionImage??x.solution_image??x.solutionImageUrl??x.solution_image_url??x.solution??'').trim(),
   year:String(x.year??x.examYear??x.exam_year??'').trim()
 };
}
function parseQuestionCSV(text){const lines=text.split(/\r?\n/).filter(Boolean);if(lines.length<2)return[];const headers=splitCSVLine(lines[0]).map(x=>x.trim().toLowerCase());return lines.slice(1).map(line=>{const vals=splitCSVLine(line),o={};headers.forEach((h,i)=>o[h]=vals[i]??'');return o;});}
function splitCSVLine(line){const out=[];let cur='',quote=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'){cur+='"';i++;}else if(c==='"')quote=!quote;else if(c===','&&!quote){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;}
function editQuestion(id){
 const x=questions.find(q=>String(q.id)===String(id));
 if(!x){alert("Question not found.");return;}
 app().innerHTML=`<h1>Edit Question</h1>
 <p class="muted">Update the question below. Changes are saved to the Questions Bank immediately when you click Save Changes.</p>
 ${questionFormHTML("editQuestion")}
 <div class="form-actions">
   <button class="btn green" type="button" onclick="saveEditedQuestion(${JSON.stringify(x.id)})">Save Changes</button>
   <button class="btn light" type="button" onclick="showQuestionBank()">Cancel</button>
 </div>`;
 fillQuestionForm("editQuestion",x);
}
function fillQuestionForm(prefix,x){
 const set=(name,value)=>{const el=document.getElementById(prefix+name);if(el)el.value=value??"";};
 set("questionText",x.q);
 set("optionA",optionText(x.options?.[0]));
 set("optionB",optionText(x.options?.[1]));
 set("optionC",optionText(x.options?.[2]));
 set("optionD",optionText(x.options?.[3]));
 set("correctAnswer",String(x.answer??""));
 set("questionLevel",x.level||"Secondary");
 set("questionCategory",x.category||"");
 set("questionYear",x.year||"");
 set("questionSubject",x.subject||"");
 set("questionTopic",x.topic||"");
 set("questionExplanation",x.explanation||"");
 const solutionPreview=document.getElementById(prefix+"solutionImagePreview");
 if(solutionPreview && x.solutionImage){ solutionPreview.dataset.dataUrl=x.solutionImage; solutionPreview.innerHTML=`<img src="${escapeHtml(x.solutionImage)}" alt="Solution image preview">`; }
 toggleManualExamYearField(prefix);
 toggleManualExamYearField(prefix);
 const preview=document.getElementById(prefix+"imagePreview");
 if(preview && x.image){
   preview.dataset.dataUrl=x.image;
   preview.innerHTML=`<img src="${escapeHtml(x.image)}" alt="Question diagram preview">`;
 }
}
function saveEditedQuestion(id){
 const existing=questions.find(q=>String(q.id)===String(id));
 if(!existing){alert("Question not found.");return;}
 const updated=readQuestionFields("editQuestion");
 if(!updated.q||updated.options.some(o=>!o)||![0,1,2,3].includes(updated.answer)||!updated.category||!updated.subject||!updated.topic){
   return alert("Complete the question fields, including subject and topic.");
 }
 if(['UTME','WASSCE'].includes(updated.category.trim().toUpperCase())&&!/^\d{4}$/.test(updated.year)){
   return alert(`Enter the 4-digit ${updated.category.trim().toUpperCase()} exam year.`);
 }
 // Keep the existing image when the editor is opened without selecting a replacement.
 if(!updated.image)updated.image=existing.image||"";
 if(!updated.solutionImage)updated.solutionImage=existing.solutionImage||"";
 Object.assign(existing,updated,{id:existing.id});
 save();
 showQuestionBank();
}
function deleteQuestion(id){confirmQuestionDelete([String(id)])}

function showChallengeBuilder(){
 app().innerHTML=`<h1>Create Quiz Challenge</h1>
 <div class="form">
 <label>Challenge title</label><input id="challengeTitle" placeholder="e.g. 2026 UTME Mathematics Challenge">
 <label>Question source</label>
 <div class="source-choice">
   <button class="source-card" id="bankChoice" onclick="selectChallengeSource(&quot;bank&quot;)"><b>📚 Choose questions from Questions Bank</b><span>Select existing questions for this challenge.</span></button>
   <button class="source-card" id="uploadChoice" onclick="selectChallengeSource(&quot;upload&quot;)"><b>⬆️ Upload new questions</b><span>Upload one or more JSON files, each with its own metadata.</span></button>
 </div>
 <div id="challengeSourceArea"></div>
 <div class="row"><div><label>Number of questions</label><input id="challengeCount" type="number" min="1" value="10"></div><div><label>Standard time limit (minutes)</label><input id="challengeMinutes" type="number" min="1" value="10"></div></div>
 <p class="muted">The time limit above is fixed by the admin for this challenge. Users cannot change it.</p>
 <br><button class="btn green" onclick="createChallenge()">Create Challenge</button>
 <button class="btn light" onclick="adminDashboard()">Back</button>
 </div>`;
 selectChallengeSource("bank");
}
let challengeSource="bank";
let challengeSelected=[];
let challengeUploaded=[];
function selectChallengeSource(source){
 challengeSource=source;challengeSelected=[];challengeUploaded=[];
 document.getElementById("bankChoice")?.classList.toggle("selected",source==="bank");
 document.getElementById("uploadChoice")?.classList.toggle("selected",source==="upload");
 const area=document.getElementById("challengeSourceArea");
 if(source==="bank"){
   area.innerHTML=`<div class="challenge-picker"><h3>Select questions from the Questions Bank</h3><div class="form-grid"><label>Search questions<input id="challengeSearch" placeholder="Search question bank..." oninput="renderChallengeBankPicker()"></label><label>Exam year<select id="challengeYearFilter" onchange="renderChallengeBankPicker()"></select></label></div><div id="challengePickerList"></div></div>`;
   renderChallengeBankPicker();
 }else{
   area.innerHTML=`<div class="challenge-picker"><h3>Upload new questions</h3>
   <p class="muted">Upload one or more JSON files. For every file, fill its section, exam type/class and subject. Topic is optional. Each file is treated as a separate question group.</p>
   <input id="challengeJsonFiles" type="file" accept=".json,application/json" multiple onchange="loadChallengeJsonFiles(event)">
   <div id="challengeFileGroups"></div>
   <div class="form-actions"><button class="btn light" type="button" onclick="clearChallengeJsonFiles()">Clear uploaded files</button></div>
   </div>`;
 }
}
function loadChallengeJsonFiles(event){
 const files=[...(event.target.files||[])];
 const box=document.getElementById('challengeFileGroups'); if(!box)return;
 challengeUploaded=[];
 if(!files.length){box.innerHTML='';return;}
 box.innerHTML='<p class="muted">Reading JSON files…</p>';
 Promise.all(files.map(file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result);const rows=Array.isArray(data)?data:(Array.isArray(data.questions)?data.questions:[]);if(!rows.length)throw new Error('No questions found');const imported=rows.map(normalizeImportedQuestion);const bad=imported.findIndex(x=>!x.q||x.options.length!==4||x.options.some(o=>!o)||![0,1,2,3].includes(x.answer));if(bad>=0)throw new Error(`Question ${bad+1} is incomplete or has an invalid answer`);resolve({name:file.name,questions:imported});}catch(e){reject(new Error(`${file.name}: ${e.message}`));}};r.onerror=()=>reject(new Error(`${file.name}: could not be read`));r.readAsText(file);}))).then(groups=>{challengeUploaded=groups;renderChallengeFileGroups();}).catch(e=>{challengeUploaded=[];box.innerHTML=`<div class="notice">${escapeHtml(e.message)}</div>`;});
}
function renderChallengeFileGroups(){
 const box=document.getElementById('challengeFileGroups');if(!box)return;
 box.innerHTML=challengeUploaded.map((g,i)=>`<div class="upload-file-group" data-file-index="${i}"><div class="section-head"><div><h4>${escapeHtml(g.name)}</h4><span class="muted">${g.questions.length} question(s)</span></div></div><div class="form-grid"><label>Section<select data-meta="level"><option value="">Select section</option><option>Secondary</option><option>Tertiary</option></select></label><label>Exam type / class<input data-meta="category" placeholder="e.g. UTME, WASSCE, 100 Level"></label><label>Subject<input data-meta="subject" placeholder="e.g. Mathematics"></label><label>Topic (optional)<input data-meta="topic" placeholder="Leave blank to keep each question's topic"></label><label>Exam year (UTME/WASSCE)<input data-meta="year" type="number" min="1970" max="2100" placeholder="Used when questions do not each have a year"></label></div><p class="muted">For UTME/WASSCE, enter an exam year when the questions do not each contain one. If every question has its own year, those years are retained.</p><details><summary>Preview questions</summary><div class="file-question-preview">${g.questions.slice(0,8).map(q=>`<div class="admin-item"><div><b>${escapeHtml(q.q)}</b><br><span class="muted">${escapeHtml(q.year||'No year')} · ${escapeHtml(q.topic||'No topic')}</span></div></div>`).join('')}${g.questions.length>8?`<p class="muted">+ ${g.questions.length-8} more…</p>`:''}</div></details></div>`).join('');
}
function clearChallengeJsonFiles(){challengeUploaded=[];const input=document.getElementById('challengeJsonFiles');if(input)input.value='';const box=document.getElementById('challengeFileGroups');if(box)box.innerHTML='';}
function renderChallengeBankPicker(){
 const box=document.getElementById("challengePickerList");if(!box)return;
 const term=document.getElementById("challengeSearch")?.value.toLowerCase()||"";
 const year=document.getElementById("challengeYearFilter")?.value||"";
 const yearSelect=document.getElementById("challengeYearFilter");if(yearSelect){const years=[...new Set(questions.map(x=>String(x.year||'').trim()).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));yearSelect.innerHTML='<option value="">All exam years</option>'+years.map(v=>`<option value="${escapeHtml(v)}"${v===year?' selected':''}>${escapeHtml(v)}</option>`).join('');}
 const list=questions.filter(x=>(!term||x.q.toLowerCase().includes(term))&&(!year||String(x.year||'')===year));
 box.innerHTML=list.map(x=>`<label class="pick-item"><input type="checkbox" ${challengeSelected.includes(x.id)?"checked":""} onchange="toggleChallengeQuestion(${x.id},this.checked)"><span><b>${x.q}</b><small>${x.level} · ${x.category} · ${x.subject||"General"} · ${x.topic||"Uncategorized"}${x.year?` · ${x.year}`:""}</small></span></label>`).join("")||"<p class='muted'>No questions found.</p>";
}
function toggleChallengeQuestion(id,checked){if(checked&&!challengeSelected.includes(id))challengeSelected.push(id);if(!checked)challengeSelected=challengeSelected.filter(x=>x!==id)}
function createChallenge(){
 const title=document.getElementById("challengeTitle").value.trim();
 const count=Math.max(1,+document.getElementById("challengeCount").value||1);
 const minutes=Math.max(1,+document.getElementById("challengeMinutes").value||1);
 if(!title)return alert("Enter a challenge title.");
 let pool;
 if(challengeSource==="bank"){
   pool=questions.filter(x=>challengeSelected.map(String).includes(String(x.id)));
   if(!pool.length)return alert("Select at least one question from the Questions Bank.");
 }else{
   if(!challengeUploaded.length)return alert("Upload at least one JSON file.");
   const groups=[...document.querySelectorAll('.upload-file-group')];
   const built=[];
   for(const group of groups){
     const v=k=>group.querySelector(`[data-meta="${k}"]`)?.value.trim()||'';
     const level=v('level'),category=v('category'),subject=v('subject'),topic=v('topic'),year=v('year');
     if(!level||!category||!subject)return alert(`Complete section, exam type/class and subject for ${challengeUploaded[group.dataset.fileIndex]?.name||'the selected file'}.`);
     const src=challengeUploaded[Number(group.dataset.fileIndex)];
     const allHaveYears=src.questions.length>0&&src.questions.every(q=>/^\d{4}$/.test(String(q.year||'').trim()));
     if(['UTME','WASSCE'].includes(category.toUpperCase())&&!allHaveYears&&!/^\d{4}$/.test(year))return alert(`Enter the 4-digit ${category.toUpperCase()} exam year for ${src.name}, or provide a year in every question.`);
     src.questions.forEach(q=>built.push({...q,id:`challenge_q_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,level,category,subject,topic:topic||q.topic||'Uncategorized',examType:category,year:q.year||(['UTME','WASSCE'].includes(category.toUpperCase())?year:'') }));
   }
   pool=built;
 }
 if(count>pool.length)return alert(`You selected ${count} questions, but only ${pool.length} questions are available for this challenge.`);
 const createdAt=Date.now();
 const challenge={id:"challenge_"+createdAt+"_"+Math.random().toString(36).slice(2,8),title,count,minutes,source:challengeSource,questionIds:challengeSource==="bank"?pool.map(x=>x.id):[],questions:challengeSource==="upload"?pool:undefined,createdAt,expiresAt:createdAt+48*60*60*1000,locked:false,leaderboardLocked:false};
 sharedChallenges.push(challenge);save();
 alert("Quiz Challenge created successfully.");
}
function updateAuth(){document.getElementById("authBtn").textContent=current?"Profile":"Sign In"}
function scrollPageTop(){window.scrollTo({top:0,behavior:'smooth'});}
function scrollPageBottom(){window.scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'});}
function updatePageScrollControls(){const el=document.getElementById('pageScrollControls');if(!el)return;const long=document.documentElement.scrollHeight>window.innerHeight*1.35;el.classList.toggle('visible',long);}
window.addEventListener('scroll',updatePageScrollControls,{passive:true});
window.addEventListener('resize',updatePageScrollControls);
new MutationObserver(()=>requestAnimationFrame(updatePageScrollControls)).observe(document.getElementById('app'),{childList:true,subtree:true});

(async function initApp(){
 await loadSharedData();
 showHome();
})();
