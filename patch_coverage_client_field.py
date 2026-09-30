def patch(path, pairs):
    s=open(path,encoding='utf-8').read()
    for a,b in pairs:
        assert s.count(a)==1,(path,a)
        s=s.replace(a,b)
    open(path,'w',encoding='utf-8').write(s)
patch('lib/jira-client.js',[
("  'customfield_11490',\n  'customfield_10828'\n];","  'customfield_11490',\n  'customfield_10828',\n  'customfield_11391'\n];")])
patch('lib/pmo-transform.js',[
("""  return {
    key: issue.key || '',
    client: String(fields.summary || '').trim(),
    client_key: normalizeCoverageClient(fields.summary || ''),""",
"""  // Client comes from the PSA epic's Client field (same catalog as Assignments);
  // the epic title is only a fallback for epics where it is still empty.
  const clientName = String(fieldValue(fields[CF_CLIENT]) || fields.summary || '').trim();

  return {
    key: issue.key || '',
    client: clientName,
    client_key: normalizeCoverageClient(clientName),""")])
print('ok')
