import { api } from './api.js';
import { RELATIONSHIP_PRESETS } from './relationship-contract.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const req = (url, method = 'GET', body, options = {}) => api.request('/api/response-lab' + url, { ...options, method, silent: true, ...(body ? { body: JSON.stringify(body) } : {}) });
let lab = null, trials = [], trial = null, batchIndex = 0, busy = false, pollTimer = null;
let pollEpoch = 0, pollFailures = 0, pollMessage = '', pollController = null;
let accepted = new Set(), favorite = null, draftDirty = false;
const currentBatch = () => trial?.batches[batchIndex];
const latestBatch = () => batchIndex === (trial?.batches.length || 0) - 1;
const feedbackLocked = () => trial?.batches.some(b => b.tournament && b.sourceBatchId === currentBatch()?.id);
const completedAnswers = () => currentBatch()?.candidates.filter(c => c.status === 'complete') || [];
function optionLabel(index) {
  let label = '';
  do { label = String.fromCharCode(65 + index % 26) + label; index = Math.floor(index / 26) - 1; } while (index >= 0);
  return label;
}
function notice(message, success = false) { $('notice').textContent = message; $('notice').classList.toggle('success', success); $('notice').hidden = !message; }
function draftKey() { return `response-lab-draft:${trial?.id}:${currentBatch()?.id}`; }
function writeDraft() { draftDirty = true; sessionStorage.setItem(draftKey(), JSON.stringify({ accepted: [...accepted], favorite })); updateSelection(); updateDisabled(); }
function restoreDraft() {
  const batch = currentBatch();
  let draft = null;
  try { draft = JSON.parse(sessionStorage.getItem(draftKey())); } catch { /* ignore invalid local drafts */ }
  const valid = new Set((batch?.candidates || []).filter(c => c.status === 'complete').map(c => c.id));
  if (feedbackLocked()) draft = null;
  const carried = (batch?.candidates || []).filter(c => c.carriedFromBatchId).map(c => c.id);
  accepted = new Set((draft?.accepted || batch?.feedback?.accepted || carried).filter(id => valid.has(id)));
  favorite = draft?.favorite || batch?.feedback?.favorite || null;
  if (!accepted.has(favorite)) favorite = null;
  draftDirty = Boolean(draft);
}
function setBusy(value) { busy = value; updateDisabled(); }
function updateDisabled() {
  const generating = trial?.status === 'generating';
  const locked = feedbackLocked();
  for (const id of ['createLab', 'newLab', 'savedLab', 'savedTrial', 'batchSelect', 'deleteLab']) $(id).disabled = busy || generating;
  $('message').disabled = !lab || busy || generating;
  $('generate').disabled = !lab || busy || generating;
  $('comparePrompts').disabled = !lab || busy || generating;
  $('generate').textContent = $('comparePrompts').checked ? 'Start blind comparison' : trial ? 'Start new tournament' : 'Start tournament · 5 answers';
  const usable = completedAnswers().length > 0;
  const atLimit = (trial?.batches.length || 0) >= 20;
  $('noneFit').textContent = latestBatch() && !atLimit ? 'None fit · next round' : 'None fit · save rejection';
  $('saveChoices').disabled = busy || generating || locked || !usable || !accepted.size;
  $('noneFit').disabled = busy || generating || locked || !usable;
  $('more').disabled = !trial || !currentBatch() || busy || generating || !latestBatch() || atLimit || (usable && !accepted.size && !(currentBatch()?.feedback?.noneFit && !draftDirty));
  $('more').textContent = generating ? pollMessage ? 'Waiting to reconnect…' : 'Generating…' : !usable ? 'Retry round' : currentBatch()?.feedback && !draftDirty ? 'Next round' : 'Save & next round';
  $('clearFeedback').disabled = busy || generating || locked || !currentBatch()?.feedback;
  document.querySelectorAll('#answers button,#answers input').forEach(el => { el.disabled = busy || generating || (locked && el.dataset.action !== 'continue'); });
  $('generationHint').textContent = generating ? pollMessage || 'Generating and checking new replies. Only replies that pass the checks will appear. You can leave and return.' : lab ? 'Each round keeps your picks and tries to add up to five new challengers. Checks can reduce the final count.' : 'Create a workspace to begin.';
  $('roundHint').textContent = locked ? 'These choices already advanced to another round. Open the latest round to change which answers stay.' : !latestBatch() ? 'You are viewing an earlier batch. Open the latest one to advance.' : atLimit ? 'This tournament has reached 20 batches. Start a new prompt to continue exploring.' : 'Keep any answers you still like. Saving rejects the other completed replies; the next round carries your picks forward unchanged.';
}
function updateSelection() {
  const completed = currentBatch()?.candidates.filter(c => c.status === 'complete').length || 0;
  $('selectionCount').textContent = `${accepted.size} accepted · ${Math.max(0, completed - accepted.size)} rejected when saved`;
  const feedback = currentBatch()?.feedback;
  $('saveStatus').textContent = draftDirty ? 'Draft · not submitted' : feedback ? `Saved · ${feedback.accepted.length} accepted, ${feedback.rejected.length} rejected` : currentBatch()?.carriedCount ? 'Previous picks selected · new round not reviewed' : 'Not reviewed';
  document.querySelectorAll('.answer-card[data-id]').forEach(card => {
    const id = card.dataset.id;
    card.classList.toggle('selected', accepted.has(id));
    card.querySelector('input').checked = accepted.has(id);
    card.querySelector('.favorite').setAttribute('aria-pressed', String(favorite === id));
  });
}
function renderAnswers() {
  // Keep prompt navigation on the latest revision after saving or generating.
  if (trial) trials = trials.map(item => item.id === trial.id ? trial : item);
  $('results').hidden = !trial;
  $('emptyState').hidden = Boolean(trial);
  if (!trial) { updateDisabled(); return; }
  const batch = currentBatch();
  $('batchSelect').innerHTML = trial.batches.map((b, i) => `<option value="${i}">${b.tournament ? `Round ${b.roundNumber}` : `Batch ${i + 1}${b.comparison ? ' · comparison' : ''}`}${b.feedback ? ' · reviewed' : ''}</option>`).join('');
  $('batchSelect').value = String(batchIndex);
  const candidates = batch?.candidates || [];
  const active = trial.status === 'generating' && batchIndex === trial.batches.length - 1;
  const complete = candidates.filter(c => c.status === 'complete').length;
  const carriedCount = candidates.filter(c => c.status === 'complete' && c.carriedFromBatchId).length;
  // A challenger target is not a completed answer. Keep the grid limited to real
  // candidates while screening runs, rather than showing slots that disappear.
  const count = batch?.tournament ? candidates.length : batch?.comparison ? 10 : 5;
  const screening = batch?.screening;
  $('results').classList.toggle('without-answers', complete === 0);
  const screened = screening?.filteredCount ? ` · ${screening.filteredCount} repeated or inconsistent ${screening.filteredCount === 1 ? 'reply' : 'replies'} filtered out` : '';
  const missing = screening?.unavailable ? ' · Similarity check unavailable; unchecked replies were withheld.' : screening?.generationFailed ? ' · New replies could not be generated. Your kept answers are preserved; try another round.' : screening?.incomplete ? ' · Fewer new replies passed the checks this round.' : '';
  $('batchStatus').textContent = active ? batch?.tournament ? `${carriedCount} carried forward · ${complete - carriedCount} new replies ready · Checking for up to ${batch.challengerCount || 5} new challengers…${screened}` : `Generating and checking ${count} new replies…` : trial.status === 'interrupted' && latestBatch() ? 'Generation interrupted. Your accepted answers are preserved; retry or advance when ready.' : batch?.tournament ? `${carriedCount} carried forward · ${complete - carriedCount} new challengers · same story snapshot${screened}${missing}` : `${complete} completed answers · same story snapshot${batch?.comparison ? ' · blind comparison' : ''} · ${batch?.preferenceReviewCount || 0} saved reviews used`;
  if (active && pollMessage) $('batchStatus').textContent = `${carriedCount} carried forward · ${complete - carriedCount} new replies last confirmed. ${pollMessage}`;
  $('answers').innerHTML = Array.from({ length: count }, (_, i) => {
    const c = candidates[i];
    const letter = optionLabel(i);
    if (!c || c.status !== 'complete') return `<article class="answer-card pending-card"><div class="answer-top"><span class="answer-letter">OPTION ${letter}</span></div><p class="answer-text">${!c ? active ? 'Waiting for this possibility…' : 'No completed answer in this slot.' : c.status === 'duplicate' ? 'This answer repeated an earlier option. It is excluded from feedback.' : esc(c.error)}</p></article>`;
    const badge = batch?.tournament ? `<span class="answer-badge${c.carriedFromBatchId ? ' carried' : ''}">${c.carriedFromBatchId ? 'Carried forward' : 'New challenger'}</span>` : '';
    return `<article class="answer-card" data-id="${esc(c.id)}"><div class="answer-top"><div class="answer-identity"><span class="answer-letter">OPTION ${letter}</span>${badge}</div><button class="favorite" type="button" data-action="favorite" aria-label="Mark option ${letter} as favorite" aria-pressed="false">★</button></div><div class="answer-text">${esc(c.text).replace(/\*([^*]+)\*/g, '<em>$1</em>')}</div><div class="answer-footer"><label class="accept-label"><input type="checkbox" data-action="accept" aria-label="Accept option ${letter}" />${batch?.tournament ? 'Keep for next round' : 'Would accept'}</label><button class="continue-button" type="button" data-action="continue">Continue with this ↗</button></div></article>`;
  }).join('');
  if (batch?.tournament && !candidates.length) {
    const explanation = active ? pollMessage || 'Generating and checking replies. Screened rounds may need another attempt; completed replies will appear here.'
      : screening?.generationFailed ? screening.failure?.code === 'timeout'
        ? 'The AI provider timed out before returning replies. Try Retry round; your saved evaluations are intact.'
        : 'The AI provider could not return a complete set of replies. Use Retry round to try again.'
      : screening?.unavailable ? 'Replies were generated, but their checks failed. Retry round can recover an initial set when no previous evaluations exist.'
      : 'No new replies passed the checks in this round. Use Retry round to try again.';
    $('answers').innerHTML = `<p class="generation-state" role="status">${esc(explanation)}</p>`;
  }
  restoreDraft(); updateSelection(); updateDisabled();
}
function renderLab() {
  $('setupForm').hidden = Boolean(lab); $('labInfo').hidden = !lab;
  $('savedLab').value = lab?.id || '';
  if (lab) {
    const c = lab.snapshot;
    $('labName').textContent = lab.title;
    $('labIdentity').textContent = `${c.character.name} · ${c.persona?.name || 'No persona'} · ${c.state.relationshipStage}`;
    $('contextText').textContent = [c.character.personality, c.character.background, c.persona?.description,
      c.setup ? `Scene setup: ${c.setup}` : '', c.storySummary ? `Earlier story: ${c.storySummary}` : '',
      ...c.history.map(m => `${m.role === 'user' ? c.persona?.name || 'You' : c.character.name}: ${m.content}`)].filter(Boolean).join('\n\n');
    $('savedTrial').innerHTML = '<option value="">New prompt</option>' + trials.map(t => `<option value="${esc(t.id)}">${esc(t.message.slice(0, 75))}</option>`).join('');
    $('savedTrial').value = trial?.id || '';
  }
  renderAnswers();
}
async function refreshList() {
  const labs = await req('');
  $('savedLab').innerHTML = '<option value="">New lab</option>' + labs.map(l => `<option value="${esc(l.id)}">${esc(l.title)}</option>`).join('');
  $('savedLab').value = lab?.id || '';
}
function setUrl() {
  const url = new URL(location.href); url.search = '';
  if (lab) url.searchParams.set('lab', lab.id);
  if (trial) url.searchParams.set('trial', trial.id);
  history.replaceState(null, '', url);
}
async function loadLab(id, trialId) {
  stopPolling();
  const data = await req(`/labs/${encodeURIComponent(id)}`);
  lab = data.lab; trials = data.trials;
  trial = trials.find(t => t.id === trialId) || trials[0] || null;
  batchIndex = Math.max(0, (trial?.batches.length || 1) - 1);
  $('comparePrompts').checked = false;
  $('message').value = trial?.message || '';
  renderLab(); setUrl(); schedulePoll();
}
function stopPolling() {
  clearTimeout(pollTimer);
  pollEpoch++;
  pollController?.abort();
  pollController = null;
  pollFailures = 0; pollMessage = '';
}
async function readTrialStatus(trialId) {
  const controller = new AbortController();
  pollController = controller;
  let timeout;
  try {
    // Bound both fetch and response-body reads. A stalled connection must not
    // prevent subsequent polls from discovering an already completed round.
    return await Promise.race([
      req(`/trials/${encodeURIComponent(trialId)}`, 'GET', undefined, { signal: controller.signal }),
      new Promise((_, reject) => { timeout = setTimeout(() => {
        controller.abort(); reject(new Error('Checking this round timed out.'));
      }, 15000); })
    ]);
  } finally {
    clearTimeout(timeout);
    if (pollController === controller) pollController = null;
  }
}
function schedulePoll(delay = 1800) {
  clearTimeout(pollTimer);
  if (trial?.status !== 'generating') return;
  const labId = lab.id, trialId = trial.id, epoch = pollEpoch;
  const stillCurrent = () => pollEpoch === epoch && lab?.id === labId && trial?.id === trialId;
  pollTimer = setTimeout(async () => {
    try {
      const data = await readTrialStatus(trialId);
      if (!stillCurrent()) return;
      if (data?.id !== trialId || !Array.isArray(data.batches)) throw new Error('Unable to read this round.');
      // Never replace a newer local revision with an older in-flight read.
      if (data.revision >= trial.revision) trial = data;
      pollFailures = 0; pollMessage = '';
      renderAnswers(); schedulePoll();
    } catch (e) {
      if (!stillCurrent()) return;
      const authRequired = /401|403|auth|token|sign in|permission/i.test(e.message);
      pollMessage = authRequired ? 'Sign in again to check this round. Your saved choices are preserved.'
        : 'Connection interrupted. Reconnecting to check this round; your saved choices are preserved.';
      if (authRequired) $('authNotice').hidden = false;
      renderAnswers();
      // A failed read says nothing about the worker. Keep its last confirmed
      // state and reconnect without starting generation or submitting ratings.
      if (!authRequired) schedulePoll(Math.min(10000, 1500 * 2 ** Math.min(++pollFailures, 3)));
    }
  }, delay);
}
async function startBatch(initial = false) {
  stopPolling();
  trial = await req(`/trials/${encodeURIComponent(trial.id)}/batches`, 'POST', {
    revision: trial.revision, requestId: crypto.randomUUID(), mode: initial && $('comparePrompts').checked ? 'comparison' : 'tournament',
    ...(!initial && currentBatch() ? { sourceBatchId: currentBatch().id } : {})
  });
  batchIndex = trial.batches.length - 1; renderAnswers(); schedulePoll();
}
async function saveFeedback(noneFit = false) {
  if (!noneFit && !accepted.size) throw new Error('Select an answer to keep, or use “None fit” to reject this round.');
  const key = draftKey();
  trial = await req(`/trials/${encodeURIComponent(trial.id)}/batches/${encodeURIComponent(currentBatch().id)}/feedback`, 'PUT', {
    revision: trial.revision, accepted: noneFit ? [] : [...accepted], favorite: noneFit ? null : favorite, noneFit
  });
  sessionStorage.removeItem(key); draftDirty = false; renderAnswers();
}
async function nextRound(noneFit = false) {
  if (!latestBatch()) throw new Error('Open the latest round to advance.');
  if (completedAnswers().length && (noneFit || !currentBatch().feedback || draftDirty)) await saveFeedback(noneFit);
  await startBatch();
}
async function action(fn) {
  if (busy) return;
  notice(''); setBusy(true);
  try { await fn(); } catch (e) { notice(e.message); } finally { setBusy(false); }
}
$('sourceChat').addEventListener('change', () => { const imported = Boolean($('sourceChat').value); $('freshFields').hidden = imported; $('character').required = !imported; $('importHint').hidden = !imported; });
$('comparePrompts').addEventListener('change', updateDisabled);
$('setupForm').addEventListener('submit', event => { event.preventDefault(); action(async () => {
  const created = await req('', 'POST', { characterId: $('character').value, personaId: $('persona').value || undefined,
    stage: $('stage').value || undefined, setup: $('setup').value, title: $('labTitle').value,
    sourceSessionId: $('sourceChat').value || undefined });
  await refreshList(); await loadLab(created.id); notice('Workspace created. Write your next message to explore five responses.', true);
}); });
$('newLab').addEventListener('click', () => { stopPolling(); lab = null; trial = null; trials = []; $('message').value = ''; $('comparePrompts').checked = false; setUrl(); renderLab(); notice(''); });
$('savedLab').addEventListener('change', () => { if (!$('savedLab').value) return $('newLab').click(); action(() => loadLab($('savedLab').value)); });
$('savedTrial').addEventListener('change', () => { stopPolling(); trial = trials.find(t => t.id === $('savedTrial').value) || null; batchIndex = Math.max(0, (trial?.batches.length || 1) - 1); $('message').value = trial?.message || ''; setUrl(); renderAnswers(); schedulePoll(); });
$('promptForm').addEventListener('submit', event => { event.preventDefault(); action(async () => {
  trial = await req(`/labs/${encodeURIComponent(lab.id)}/trials`, 'POST', { message: $('message').value, requestId: crypto.randomUUID() });
  trials.unshift(trial); renderLab(); setUrl(); await startBatch(true);
}); });
$('batchSelect').addEventListener('change', () => { batchIndex = Number($('batchSelect').value); renderAnswers(); });
$('answers').addEventListener('change', event => {
  if (event.target.dataset.action !== 'accept') return;
  const id = event.target.closest('[data-id]').dataset.id;
  if (event.target.checked) accepted.add(id); else { accepted.delete(id); if (favorite === id) favorite = null; }
  writeDraft();
});
$('answers').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const id = button.closest('[data-id]').dataset.id;
  if (button.dataset.action === 'favorite') { favorite = favorite === id ? null : id; if (favorite) accepted.add(id); writeDraft(); }
  if (button.dataset.action === 'continue') action(async () => {
    const branch = await req(`/trials/${encodeURIComponent(trial.id)}/branch`, 'POST', { candidateId: id });
    await refreshList(); await loadLab(branch.id); $('message').focus(); notice('Scene continued with that answer only. Ratings are unchanged.', true);
  });
});
$('saveChoices').addEventListener('click', () => action(async () => { await saveFeedback(); notice('Accepted and rejected answers saved. These choices can guide your next generation.', true); }));
$('noneFit').addEventListener('click', () => action(async () => {
  if (latestBatch() && trial.batches.length < 20) await nextRound(true);
  else { await saveFeedback(true); notice('All completed answers in this round were saved as rejected.', true); }
}));
$('more').addEventListener('click', () => action(() => nextRound()));
$('clearFeedback').addEventListener('click', () => action(async () => {
  const key = draftKey();
  trial = await req(`/trials/${encodeURIComponent(trial.id)}/batches/${encodeURIComponent(currentBatch().id)}/feedback`, 'PUT', { revision: trial.revision, clear: true });
  sessionStorage.removeItem(key); renderAnswers(); notice('Feedback cleared. This batch will no longer guide future generations.', true);
}));
$('exportLab').addEventListener('click', () => action(async () => {
  const data = await req(`/labs/${encodeURIComponent(lab.id)}/export`);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `response-lab-${lab.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}));
$('deleteLab').addEventListener('click', () => action(async () => { await req(`/labs/${encodeURIComponent(lab.id)}`, 'DELETE'); lab = null; trial = null; trials = []; setUrl(); await refreshList(); renderLab(); notice('Lab deleted.', true); }));
async function init() {
  if (!api.getToken()) { $('authNotice').hidden = false; $('setupForm').hidden = true; $('createLab').disabled = true; return; }
  const me = await api.getMe();
  if (!me || me.role !== 'admin') {
    window.location.replace('/');
    return;
  }
  const [characters, personas, chats] = await Promise.all([api.getCharacters(), api.getPersonas(), api.getChatSessions()]);
  $('character').innerHTML = characters.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  $('persona').innerHTML += personas.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('sourceChat').innerHTML += chats.map(c => `<option value="${esc(c.id)}">${esc(c.title)} · ${c.messageCount} messages</option>`).join('');
  $('stage').innerHTML += RELATIONSHIP_PRESETS.map(p => `<option value="${esc(p.stage)}">${esc(p.label)}</option>`).join('');
  const query = new URLSearchParams(location.search);
  if (query.get('session')) { $('sourceChat').value = query.get('session'); $('sourceChat').dispatchEvent(new Event('change')); }
  await refreshList();
  if (query.get('lab')) await loadLab(query.get('lab'), query.get('trial'));
}
init().catch(error => { notice(error.message); if (/401|auth|token/i.test(error.message)) $('authNotice').hidden = false; });
