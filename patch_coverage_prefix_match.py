p='index.html'
s=open(p,encoding='utf-8').read()
a="""function coverageForClient(client){
  const row = accountCoverageMap().get(normalizeClientKey(client));
"""
assert s.count(a)==1
b="""function coverageForClient(client){
  const map = accountCoverageMap();
  const clientKey = normalizeClientKey(client);
  let row = map.get(clientKey);
  // Name mismatch fallback: an assignments client "Stovell" whose active PSA epic is called
  // "Stovell Research". Use it only when exactly one epic key starts with the client key.
  if(!row && clientKey.length >= 4){
    const near = [...map.entries()].filter(([k]) => k && (k.startsWith(clientKey) || clientKey.startsWith(k)) && Math.min(k.length, clientKey.length) >= 4);
    if(near.length === 1) row = near[0][1];
  }
"""
s=s.replace(a,b)
open(p,'w',encoding='utf-8').write(s)
print('ok')
