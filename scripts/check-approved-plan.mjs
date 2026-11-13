/* global process, fetch, AbortSignal, console */
const { GH_TOKEN, GH_REPO, TARGET_SHA, TARGET_REF, APPROVED_PLAN_RUN_ID, PLAN_WORKFLOW_NAME, PLAN_WORKFLOW_FILE, PLAN_TITLE_PREFIX, PLAN_TAG_PREFIX, PLAN_ARTIFACT_PREFIX } = process.env;
if (!GH_TOKEN || !/^[\w.-]+\/[\w.-]+$/.test(GH_REPO ?? '') || !/^[a-f0-9]{40}$/.test(TARGET_SHA ?? '') || !TARGET_REF || !/^[1-9]\d*$/.test(APPROVED_PLAN_RUN_ID ?? '') || !Number.isSafeInteger(Number(APPROVED_PLAN_RUN_ID)) || !PLAN_WORKFLOW_NAME || !/^[\w.-]+\.ya?ml$/.test(PLAN_WORKFLOW_FILE ?? '') || !PLAN_TITLE_PREFIX || !PLAN_TAG_PREFIX || !/^[\w-]+$/.test(PLAN_ARTIFACT_PREFIX ?? '')) throw new Error('Configure the reviewed plan run ID and exact plan workflow metadata');
const headers = { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
async function read(path) {
  const response = await fetch(`https://api.github.com/repos/${GH_REPO}/${path}`, { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Unable to verify approved plan: HTTP ${response.status}`);
  return response.json();
}
const run = await read(`actions/runs/${APPROVED_PLAN_RUN_ID}`);
const validSource = run.event === 'workflow_dispatch' && run.head_branch === TARGET_REF || run.event === 'push' && run.head_branch?.startsWith(PLAN_TAG_PREFIX);
if (run.status !== 'completed' || run.conclusion !== 'success' || run.head_sha !== TARGET_SHA || run.head_repository?.full_name?.toLowerCase() !== GH_REPO.toLowerCase() || run.path?.split('@')[0] !== `.github/workflows/${PLAN_WORKFLOW_FILE}` || !Number.isSafeInteger(run.workflow_id) || run.workflow_id <= 0 || run.display_title !== `${PLAN_TITLE_PREFIX} plan @${TARGET_SHA}` || !validSource) throw new Error('Approved run must be a successful plan of this exact repository, branch, SHA and workflow');
// GitHub may expose a custom run-name as run.name. Resolve the authoritative
// workflow definition by its ID instead of confusing that label with its name.
const workflow = await read(`actions/workflows/${run.workflow_id}`);
if (workflow.id !== run.workflow_id || workflow.name !== PLAN_WORKFLOW_NAME || workflow.path !== `.github/workflows/${PLAN_WORKFLOW_FILE}`) throw new Error('Approved run workflow metadata does not match the required workflow');
const artifactName = `${PLAN_ARTIFACT_PREFIX}-${TARGET_SHA}-${APPROVED_PLAN_RUN_ID}`;
let found = false;
for (let page = 1; page <= 20; page++) {
  const result = await read(`actions/runs/${APPROVED_PLAN_RUN_ID}/artifacts?per_page=100&page=${page}`);
  if (!Array.isArray(result.artifacts)) throw new Error('Unexpected approved plan artifacts response');
  if (result.artifacts.some(artifact => artifact.name === artifactName && !artifact.expired)) { found = true; break; }
  if (result.artifacts.length < 100) break;
}
if (!found) throw new Error('Approved plan has no unexpired redacted text artifact');
console.log(`Reviewed plan verified: https://github.com/${GH_REPO}/actions/runs/${APPROVED_PLAN_RUN_ID}`);
