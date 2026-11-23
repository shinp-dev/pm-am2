'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),letters=['ア','イ','ウ','エ'];
const BANK=window.QUESTIONS.map(q=>({...q,id:`${q.year}-${q.n}`})),byId=Object.fromEntries(BANK.map(q=>[q.id,q])),KEY='pm-a2-room-v1';
let state={version:1,attempts:[],stars:[],notes:{},challengeBest:null},queue=[],pos=0,answered=null,started=Date.now();
function valid(s){return s&&s.version===1&&Array.isArray(s.attempts)&&s.attempts.length<100000&&s.attempts.every(a=>byId[a.id]&&Number.isInteger(a.choice)&&a.choice>=0&&a.choice<4&&Number.isSafeInteger(a.time)&&a.time>=0&&Number.isSafeInteger(a.seconds)&&a.seconds>=0)&&(s.challengeBest==null||(Number.isInteger(s.challengeBest)&&s.challengeBest>=0&&s.challengeBest<=5))&&Array.isArray(s.stars)&&s.stars.every(id=>byId[id])&&s.notes&&typeof s.notes==='object'&&!Array.isArray(s.notes)&&Object.entries(s.notes).every(([id,v])=>byId[id]&&typeof v==='string'&&v.length<=10000)}
try{let raw=localStorage.getItem(KEY);if(raw){let s=JSON.parse(raw);if(valid(s))state=s;else $('#notice').textContent='保存データを読み込めませんでした。元のデータを保護するため、このタブでは保存しません。';}}catch(e){$('#notice').textContent='このブラウザでは保存データを読み込めません。バックアップを書き出して学習履歴を保管してください。';}
let saveBlocked=$('#notice').textContent!=='';
function save(){if(saveBlocked)return;try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){$('#notice').textContent='ブラウザへの保存に失敗しました。学習レポートからバックアップを書き出してください。';}}
const attempts=id=>state.attempts.filter(a=>a.id===id),last=id=>attempts(id).at(-1),correct=a=>a&&a.choice===byId[a.id].answer;
function metrics(){let done=BANK.filter(q=>last(q.id)),latest=done.filter(q=>correct(last(q.id))).length,first=done.filter(q=>correct(attempts(q.id)[0])).length,total=state.attempts.length,ok=state.attempts.filter(correct).length;$('#summary').innerHTML=[['学習進捗',`${done.length}<em> / ${BANK.length}問</em>`,'回答済みの問題数'],['初回正答率',done.length?`${Math.round(first/done.length*100)}<em> %</em>`:'—','初めて解いたときの理解度'],['直近の正解',`${latest}<em> / ${done.length}問</em>`,'各問題の最後の回答で集計'],['累計回答',`${total}<em> 回</em>`,total?`累計正答率 ${Math.round(ok/total*100)}%`:'今日の一問から始めよう']].map(([a,b,c])=>`<div class="metric"><small>${a}</small><strong>${b}</strong><p>${c}</p></div>`).join('')}
const periods = {
  2019: { era: '平成31年度', term: '春期' },
  2020: { era: '令和2年度', term: '10月' },
};
const period = year => periods[year] ?? { era: `令和${year - 2018}年度`, term: '秋期' };
const questionName = q => `${q.year}年度 ${period(q.year).term} ｜ 問${q.n}`;
let challenge = null;
const challengeSize = 5;
const forms = ['ひと休み', '筋トレ開始', '力がついてきた', 'ムキムキ', '仕上がってる', 'カピバラ最強'];
const challengeScore = () => challenge.answers.filter(result => result.right).length;

let training = trainingSnapshot(state, byId);
let answerReward = null;
let answerCombo = 0;

function renderTraining() {
  $('#gymMascot').dataset.form = training.form;
  $('#gymLevel').textContent = `Lv. ${training.level}`;
  $('#gymStreak').textContent = training.streak ? `${training.streak}日連続` : '今日からスタート';
  $('#gymName').textContent = training.name;
  $('#gymXP').max = training.requirement;
  $('#gymXP').value = training.remaining;
  $('#gymXPLabel').textContent = `${training.xp.toLocaleString('ja-JP')} XP · 次のLv.まで ${training.requirement - training.remaining} XP`;
  $('#gymNextForm').textContent = training.nextForm ? `次の変身は Lv. ${training.nextForm}` : '最終形態に到達';
  const completed = training.missions.filter(mission => mission.count === mission.target).length;
  $('#missionCount').textContent = `${completed} / ${training.missions.length} 達成`;
  $('#missionList').innerHTML = training.missions.map(mission => {
    const done = mission.count === mission.target;
    return `<li class="${done ? 'mission-done' : ''}">
      <div><strong>${mission.name}</strong><small>${mission.description}</small></div>
      <span>${done ? '達成 ✓' : `${mission.count}/${mission.target}`}<small>+${TRAINING_MISSION_XP} XP</small></span>
    </li>`;
  }).join('');
}

function renderAwards() {
  const unlocked = training.achievements.filter(award => award.unlocked).length;
  $('#awardCount').textContent = `${unlocked} / ${training.achievements.length} 獲得`;
  $('#awardsList').innerHTML = training.achievements.map(award => `<li class="${award.unlocked ? 'award-unlocked' : ''}">
    <span class="award-icon" aria-hidden="true">${award.mark}</span>
    <strong>${award.name}</strong>
    <small>${award.description}</small>
    <span class="award-progress">${award.unlocked ? '獲得済み' : `${award.count} / ${award.goal}`}</span>
  </li>`).join('');
}

function updateTraining() {
  training = trainingSnapshot(state, byId);
}

function unlocksSince(before) {
  return training.achievements.filter((award, i) => award.unlocked && !before.achievements[i].unlocked);
}

function renderAnswerReward(animate) {
  if (!answerReward) return '';
  const { xp, levelUp, newAwards, newMissions, right, combo } = answerReward;
  const messages = [
    ...newMissions.map(name => `ミッション達成「${name}」`),
    ...newAwards.map(award => `実績獲得「${award.name}」`),
  ];
  return `<div class="gym-reward ${right ? 'reward-right' : ''} ${levelUp ? 'reward-level-up' : ''} ${animate ? 'power-up' : ''}">
    ${challenge ? '' : `<div class="challenge-art reward-mascot" data-form="${training.form}" aria-hidden="true">${animate ? sparkEffect() : ''}</div>`}
    <div><strong>${levelUp ? `レベルアップ · Lv. ${training.level}` : right ? '正解！' : 'トレーニング記録'}</strong>
    <span class="reward-xp">${xp ? `+${xp} XP` : '復習済み'}</span>
    ${combo >= 2 ? `<span class="reward-combo">${combo}連続正解</span>` : ''}
    ${messages.length ? `<ul>${messages.map(message => `<li>${message}</li>`).join('')}</ul>` : ''}
    </div>
  </div>`;
}

function sparkEffect() {
  const particles = Array.from({ length: 10 }, (_, i) => `<i style="--angle:${i * 36}deg"></i>`).join('');
  return `<div class="challenge-sparks" aria-hidden="true">${particles}</div>`;
}

function refreshChallengeBanner() {
  const best = $('#challengeBest');
  best.hidden = state.challengeBest == null;
  best.textContent = best.hidden ? '' : `自己ベスト ${state.challengeBest} / ${challengeSize} 問`;
  $('#challengeStart').textContent = challenge && !challenge.finished
    ? 'チャレンジに戻る'
    : '5問チャレンジを始める';
}

function shuffle(questions) {
  const shuffled = [...questions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function resetQueue(questions) {
  queue = questions;
  answerCombo = 0;
  answerReward = null;
  pos = 0;
  answered = null;
  started = Date.now();
}

function beginChallenge() {
  if (challenge && !challenge.finished) {
    focusQuestion();
    return;
  }
  const previous = new Set(challenge?.ids ?? []);
  const fresh = BANK.filter(q => !previous.has(q.id));
  resetQueue(shuffle(fresh).slice(0, challengeSize));
  challenge = { answers: [], ids: queue.map(q => q.id), streak: 0, longest: 0, finished: false, record: false };
  render();
  focusQuestion();
}

function focusQuestion() {
  const heading = $('#question h2');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  $('#question').scrollIntoView({ block: 'start' });
}

function recordChallengeAnswer(q) {
  if (!challenge) return;
  const right = answered === q.answer;
  challenge.answers.push({ q, right });
  challenge.streak = right ? challenge.streak + 1 : 0;
  challenge.longest = Math.max(challenge.longest, challenge.streak);
}

function challengeBoard(animate) {
  const score = challengeScore();
  const form = score === 5 ? 3 : Math.ceil(score / 2);
  const trail = queue.map((_, i) => {
    const result = challenge.answers[i];
    const value = result ? (result.right ? '○' : '×') : i === pos ? '●' : '·';
    const label = result ? (result.right ? '正解' : '不正解') : '未回答';
    return `<span class="challenge-dot" data-result="${result?.right ?? ''}" aria-label="${i + 1}問目 ${label}">${value}</span>`;
  }).join('');
  const sparks = animate ? sparkEffect() : '';
  return `<div class="challenge-board ${animate ? 'power-up' : ''}">
    <div class="challenge-art" data-form="${form}" style="--growth:${0.88 + score * 0.055}" aria-hidden="true">${sparks}</div>
    <div><span class="challenge-level">筋力 Lv.${score} · ${forms[score]}</span>
    <div class="challenge-track">${trail}</div>
    <div class="challenge-combo">正解 ${score} / ${challengeSize} 問 · ${challenge.streak}連続正解</div></div>
  </div>`;
}

function finishChallenge() {
  challenge.finished = true;
  const score = challengeScore();
  challenge.record = state.challengeBest == null || score > state.challengeBest;
  const before = training;
  if (challenge.record) {
    state.challengeBest = score;
    studySync.preference('challengeBest', score);
    updateTraining();
    save();
  }
  challenge.awards = unlocksSince(before);
  render();
  focusQuestion();
}

function renderChallengeResults() {
  const missed = challenge.answers.filter(result => !result.right);
  $('#question').innerHTML = `<div class="challenge-results">
    <h2>チャレンジ結果</h2>
    ${challengeBoard(false)}
    <p class="challenge-score">${challengeScore()}<span> / ${challengeSize} 問正解</span></p>
    <p>最長 ${challenge.longest} 連続正解${challenge.record ? ' · 自己ベスト更新' : ''}</p>
    ${challenge.awards.length ? `<p class="gym-unlocked">実績獲得「${challenge.awards.map(award => award.name).join('・')}」</p>` : ''}
    <ol class="challenge-review">${challenge.answers.map(({q, right}) =>
      `<li><span>${questionName(q)}</span><strong class="${right ? 'correct' : 'wrong'}">${right ? '○ 正解' : '× 不正解'}</strong></li>`).join('')}</ol>
    <div class="actions">
      <button id="challengeAgain" class="primary">別の5問に挑戦</button>
      ${missed.length ? '<button id="challengeRetry">間違えた問題を復習</button>' : ''}
      <button id="challengeExit">通常の演習へ</button>
    </div></div>`;
  $('#challengeAgain').onclick = beginChallenge;
  $('#challengeExit').onclick = start;
  const retry = $('#challengeRetry');
  if (retry) retry.onclick = () => {
    challenge = null;
    resetQueue(missed.map(result => result.q));
    render();
    focusQuestion();
  };
}

function start(){challenge=null;answerCombo=0;answerReward=null;queue=BANK.filter(q=>($('#year').value==='all'||q.year===Number($('#year').value))&&($('#topic').value==='all'||q.topic===$('#topic').value)&&($('#mode').value==='all'||($('#mode').value==='unseen'&&!last(q.id))||($('#mode').value==='wrong'&&last(q.id)&&!correct(last(q.id)))||($('#mode').value==='star'&&state.stars.includes(q.id))));if($('#order').value==='random')queue=shuffle(queue);pos=0;answered=null;started=Date.now();render()}
function map(){
  $('#map').hidden = Boolean(challenge);
  $('.legend').hidden = Boolean(challenge);
  $('#mapCount').textContent = `${queue.length}問`;
  if (challenge) return;
  let yr=null;$('#mapCount').textContent=`${queue.length}問`;$('#map').innerHTML=queue.map((q,i)=>{let head='';if($('#order').value==='normal'&&yr!==q.year){yr=q.year;head=`<div class="year-label">${q.year}年度</div>`}let a=last(q.id);return head+`<button title="${q.year}年 問${q.n}" class="${i===pos?'current ':''}${a?(correct(a)?'correct':'wrong'):''}" data-i="${i}">${q.n}${state.stars.includes(q.id)?'・':''}</button>`}).join('');$('#map').querySelectorAll('button').forEach(b=>b.onclick=()=>{pos=Number(b.dataset.i);answered=null;answerReward=null;started=Date.now();render()})}
function render(animate = false){
  metrics();
  refreshChallengeBanner();
  renderTraining();
  map();
  if (challenge?.finished) {
    renderChallengeResults();
    return;
  }
  let q=queue[pos];if(!q){$('#question').innerHTML='<div class="empty"><div class="eyebrow">READY FOR YOUR NEXT STEP</div><h2>対象の問題はありません</h2><p>年度・分野・対象を変更して、もう一度始めてください。</p></div>';return}let isAnswered=answered!==null,was=last(q.id);$('#question').innerHTML=`${challenge && !isAnswered ? challengeBoard(false) : ''}<div class="q-top"><span class="badge">${esc(q.topic)}</span><span class="q-position">${pos+1} / ${queue.length} 問</span></div><div class="progress-bar"><span style="width:${(pos+1)/queue.length*100}%"></span></div><h2 class="q-title">${questionName(q)}</h2><div class="q-source">出典：${period(q.year).era} ${period(q.year).term} プロジェクトマネージャ試験 午前Ⅱ 問${q.n} ／ IPA公式問題冊子 p.${q.page}</div><div class="source-links"><a target="_blank" rel="noopener" href="${q.questionUrl}#page=${q.page}">公式問題PDF ↗</a><a target="_blank" rel="noopener" href="sources/${q.year}-questions.pdf#page=${q.page}">原本の保存版 ↗</a><button id="copy" style="padding:0;border:0;background:transparent;font-size:11px">問題をコピー</button></div><div class="question-text">${esc(q.text)}</div>${q.transcriptionNote?`<p class="small">転記注記：${esc(q.transcriptionNote)}</p>`:''}${q.figure?`<img class="figure" src="${q.figure}" alt="問${q.n}の原本図表。下にテキスト補足があります。"><details><summary>図表のテキスト補足を開く（独自転記）</summary><div class="figure-text">${esc(q.figureText||'図表の詳細は原本PDFをご確認ください。')}</div></details>`:''}<div class="options">${q.options.map((o,i)=>`<button class="choice ${isAnswered?(i===q.answer?'right':i===answered?'wrong':''):''}" data-choice="${i}" ${isAnswered?'disabled':''}><span class="letter">${letters[i]}</span><span>${esc(o)}${isAnswered&&i===q.answer?' <strong>［正解］</strong>':''}${isAnswered&&i===answered?' <strong>［あなたの回答］</strong>':''}</span></button>`).join('')}</div>${isAnswered?`<section aria-live="polite">${challenge ? challengeBoard(animate && answered === q.answer) : ''}${renderAnswerReward(animate)}<div class="result ${answered===q.answer?'':'incorrect'}"><h3>${answered===q.answer?'正解です':'もう一度、ここを確認'} <span>正解：${letters[q.answer]}</span></h3><p>${esc(q.keypoint)}</p><button id="quickNext" class="primary" style="margin-top:16px">${pos===queue.length-1?(challenge?'結果を見る':'演習を終える'):'次の問題へ →'}</button></div><h3 style="font-size:15px">選択肢ごとの解説</h3><p class="small">独自解説（AI作成）／ 正答はIPA公式解答例に基づきます。</p><ul class="explanation-list">${q.explanations.map((x,i)=>`<li><strong>${letters[i]} ${i===q.answer?'正しい選択肢':'誤りの選択肢'}</strong>${esc(x)}</li>`).join('')}</ul>${q.references?`<div class="source-links">${q.references.map(r=>`<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.label)} ↗</a>`).join('')}</div>`:''}<div class="source-links"><a href="${q.answerUrl}" target="_blank" rel="noopener">IPA公式正答を確認 ↗</a><a href="sources/${q.year}-answers.pdf" target="_blank" rel="noopener">正答PDFの保存版 ↗</a></div></section>`:`<p class="small">選択肢をタップすると採点・記録されます。${was?'前回の結果：'+(correct(was)?'正解':'不正解'): 'この問題は未回答です。'}</p>`}<div class="q-actions"><button id="star">${state.stars.includes(q.id)?'★ 保存済み':'☆ あとで復習'}</button><div class="actions">${challenge?'':`<button id="prev" ${pos===0?'disabled':''}>前へ</button>`}<button id="next" class="primary" ${challenge&&!isAnswered?'disabled':''}>${pos===queue.length-1?(challenge?'結果を見る':'演習を終える'):isAnswered||challenge?'次の問題へ →':'スキップ →'}</button></div></div><div class="meta-tools"><details><summary>自分用のメモ</summary><textarea class="note" id="note" maxlength="10000" placeholder="間違えた理由や、覚えておきたいこと" aria-label="この問題のメモ">${esc(state.notes[q.id]||'')}</textarea><span class="small">入力すると自動保存します。</span></details><details><summary>転記・解説について気になる箇所がある場合</summary><p class="small">上の公式問題・正答で確認できます。問題文は原本から転記し、改行・空白を調整しています。グラフ選択肢は「アのグラフ」等のラベルを補っています。図のテキスト補足は独自の説明です。</p><button id="issueCopy">質問用に出典と問題をコピー</button></details></div>`;
$('#question').querySelectorAll('[data-choice]').forEach(button => {
  button.onclick = () => {
    if (answered !== null) return;
    const now = Date.now();
    const before = trainingSnapshot(state, byId, now);
    answered = Number(button.dataset.choice);
    const right = answered === q.answer;
    if (!challenge) answerCombo = right ? answerCombo + 1 : 0;

    const attempt = { id: q.id, choice: answered, time: now, seconds: Math.max(0, Math.round((now - started) / 1000)) };
    state.attempts.push(attempt);
    studySync.attempt(attempt);
    recordChallengeAnswer(q);
    updateTraining();
    answerReward = {
      xp: training.xp - before.xp,
      levelUp: training.level > before.level,
      newAwards: unlocksSince(before),
      newMissions: training.missions.filter((mission, i) => mission.count === mission.target && before.missions[i].count < mission.target).map(mission => mission.name),
      right,
      combo: challenge?.streak ?? answerCombo,
    };
    save();
    render(right || answerReward.levelUp);
    $('#question .gym-reward').scrollIntoView({ block: 'nearest' });
    const result = $('#question .result h3');
    result.tabIndex = -1;
    result.focus({ preventScroll: true });
  };
});$('#star').onclick=()=>{if(state.stars.includes(q.id))state.stars=state.stars.filter(id=>id!==q.id);else state.stars.push(q.id);studySync.preference('star:'+q.id,state.stars.includes(q.id));save();render()};$('#note').oninput=e=>{state.notes[q.id]=e.target.value;studySync.preference('note:'+q.id,e.target.value);save()};if($('#prev'))$('#prev').onclick=()=>move(-1);$('#next').onclick=()=>{
  if (challenge && answered === null) return;
  if (pos < queue.length - 1) move(1);
  else if (challenge) finishChallenge();
  else showStats();
};if($('#quickNext'))$('#quickNext').onclick=()=>$('#next').click();$('#copy').onclick=()=>copy(q);$('#issueCopy').onclick=()=>copy(q,true)}
function move(n){pos+=n;answered=null;answerReward=null;started=Date.now();render();if(challenge)focusQuestion();else $('#question').scrollIntoView({behavior:'smooth',block:'start'})}
async function copy(q,issue=false){let t=`出典：${q.year}年度 ${period(q.year).term} プロジェクトマネージャ試験 午前Ⅱ 問${q.n}\n${q.questionUrl}#page=${q.page}\n\n${q.text}\n${q.figureText?'\n図表のテキスト補足（独自転記）：\n'+q.figureText+'\n':''}\n${q.options.map((x,i)=>letters[i]+' '+x).join('\n')}${issue?'\n\n確認したい点：':''}`;try{await navigator.clipboard.writeText(t);$('#notice').textContent='問題と出典をコピーしました。'}catch(e){let ta=document.createElement('textarea');ta.value=t;document.body.append(ta);ta.select();let ok=document.execCommand('copy');ta.remove();$('#notice').textContent=ok?'問題と出典をコピーしました。':'コピーできませんでした。問題文を長押しして選択・コピーしてください。';}}
function showLearn(){$('#learn').hidden=false;$('#stats').hidden=true;$('#learnTab').classList.add('active');$('#statsTab').classList.remove('active');render()}
function showStats(scroll=true){updateTraining();renderAwards();$('#learn').hidden=true;$('#stats').hidden=false;$('#statsTab').classList.add('active');$('#learnTab').classList.remove('active');metrics();$('#topicsReport').innerHTML=[...new Set(BANK.map(q=>q.topic))].map(t=>{let qs=BANK.filter(q=>q.topic===t),a=state.attempts.filter(a=>byId[a.id].topic===t),ok=a.filter(correct).length,p=a.length?Math.round(ok/a.length*100):0;return `<div class="topic-row"><div class="row"><strong>${esc(t)}</strong><span>${a.length?p+'%':'未学習'}</span></div><div class="progress-bar"><span style="width:${p}%"></span></div><small>${qs.filter(q=>last(q.id)).length}/${qs.length}問に回答 · 累計${a.length}回答${a.length&&a.length<5?' · 回答数が少ないため参考値':''}</small></div>`}).join('');let h=state.attempts.slice(-15).reverse();$('#history').innerHTML=h.length?h.map(a=>`<div class="history-row"><span>${byId[a.id].year}年 問${byId[a.id].n}<br><small>${new Date(a.time).toLocaleString('ja-JP')}</small></span><strong>${correct(a)?'正解':'不正解'} · ${a.seconds}秒</strong></div>`).join(''):'<p class="small">まだ回答履歴がありません。問題を解くとここに記録されます。</p>';if(scroll)window.scrollTo({top:0,behavior:'smooth'})}
$('#learnTab').onclick=showLearn;$('#statsTab').onclick=showStats;$('#start').onclick=start;$('#challengeStart').onclick=beginChallenge;
$('#jumpQuestion').onclick=focusQuestion;
$('#gymAwards').onclick=()=>{
  showStats();
  $('#awardsTitle').focus({ preventScroll:true });
  $('#gymAchievements').scrollIntoView({ block:'start' });
};
function refreshTrainingDay() {
  updateTraining();
  renderTraining();
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshTrainingDay();
});
setInterval(refreshTrainingDay, 30_000);
$('#export').onclick=()=>{let a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.href=url;a.download='pm-a2-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
const attemptKey = a => [a.id, a.choice, a.time, a.seconds].join('/');

function mergeAttempts(first, second) {
  return [...new Map([...first, ...second].map(a => [attemptKey(a), a])).values()]
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id) || a.choice - b.choice || a.seconds - b.seconds);
}

function applyRemoteStudy(remote) {
  const next = { version: 1, attempts: mergeAttempts(state.attempts, remote.attempts), stars: [...state.stars], notes: { ...state.notes }, challengeBest: state.challengeBest };
  const stars = new Set(next.stars);
  for (const [key, value] of Object.entries(remote.preferences)) {
    const [kind, id] = key.split(':');
    if (kind === 'star') {
      if (value) stars.add(id);
      else stars.delete(id);
    }
    if (kind === 'note') next.notes[id] = value;
    if (kind === 'challengeBest') next.challengeBest = Math.max(next.challengeBest ?? 0, value);
  }
  next.stars = [...stars].sort();
  if (!valid(next)) throw Error('invalid server data');
  if (JSON.stringify(state) === JSON.stringify(next)) return;
  state = next;
  save();
  updateTraining();
  refreshChallengeBanner();
  renderTraining();
  if (!$('#stats').hidden) showStats(false);
  if (!$('#learn').hidden) {
    map();
    const question = queue[pos];
    const mark = $('#star');
    const note = $('#note');
    if (mark && question) mark.textContent = state.stars.includes(question.id) ? '★ 保存済み' : '☆ あとで復習';
    if (note && question) note.value = state.notes[question.id] ?? '';
  }
}

$('#import').onchange = async e => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20000000) throw Error('ファイルが大きすぎます。');
    const backup = JSON.parse(await file.text());
    if (!valid(backup)) throw Error('このサイトの有効なバックアップではありません。');
    if (!confirm('バックアップの学習履歴・ブックマーク・メモを追加し、D1 に同期しますか？')) return;
    const seen = new Set(state.attempts.map(attemptKey));
    for (const a of backup.attempts) {
      if (!seen.has(attemptKey(a))) {
        studySync.attempt(a);
        seen.add(attemptKey(a));
      }
    }
    state.attempts = mergeAttempts(state.attempts, backup.attempts);
    state.stars = [...new Set([...state.stars, ...backup.stars])];
    for (const id of backup.stars) studySync.preference('star:' + id, true);
    for (const [id, note] of Object.entries(backup.notes)) {
      if (Object.hasOwn(state.notes, id)) continue;
      state.notes[id] = note;
      studySync.preference('note:' + id, note);
    }
    if (backup.challengeBest != null && (state.challengeBest == null || backup.challengeBest > state.challengeBest)) {
      state.challengeBest = backup.challengeBest;
      studySync.preference('challengeBest', state.challengeBest);
    }
    answerReward = null;
    answerCombo = 0;
    saveBlocked = false;
    save();
    refreshChallengeBanner();
    $('#notice').textContent = 'バックアップを取り込みました。同期状況は画面上部で確認できます。';
    showStats();
  } catch (error) {
    $('#notice').textContent = '読み込み失敗：' + error.message;
  } finally {
    e.target.value = '';
  }
};
[...new Set(BANK.map(q=>q.year))].forEach(y=>$('#year').add(new Option(`${y}年度（${period(y).era.replace('年度','年')}）`,y)));[...new Set(BANK.map(q=>q.topic))].forEach(t=>$('#topic').add(new Option(t,t)));$('#coverage').textContent=`${BANK.at(-1).year}〜${BANK[0].year}年度 / ${BANK.length}問`;start();

studySync.start(applyRemoteStudy);

document.addEventListener("keydown",e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||["INPUT","TEXTAREA","SELECT","BUTTON"].includes(e.target.tagName)||$("#learn").hidden)return;if(/^[1-4]$/.test(e.key)&&answered===null){$("[data-choice=\""+(Number(e.key)-1)+"\"]")?.click()}else if(e.key==="Enter"&&answered!==null&&!challenge?.finished){$("#next")?.click()}});
