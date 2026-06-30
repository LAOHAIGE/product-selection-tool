export async function fetchWithWorkspaceRecovery(fetchImpl, input, init, options) {
  let response = await fetchImpl(input, init);
  if (response.status !== 400 || !options.hasWorkspace()) return response;
  const error = await response.clone().json().catch(() => ({}));
  if (!String(error.error || "").includes("Please import a product workbook")) return response;
  await options.restoreWorkspace();
  response = await fetchImpl(input, init);
  return response;
}
