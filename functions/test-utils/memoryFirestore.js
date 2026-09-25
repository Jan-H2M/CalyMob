class MemoryTimestamp {
  constructor(value) { this.value = new Date(value); }
  toDate() { return new Date(this.value); }
  toMillis() { return this.value.getTime(); }
}

const value = (v) => v && typeof v.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : v;
const matches = (data, filters) => filters.every(({ field, op, expected }) => {
  const actual = value(data[field]); const wanted = value(expected);
  return op === '==' ? actual === wanted : op === '>' ? actual > wanted : op === 'in' ? expected.includes(actual) : false;
});

class MemoryFirestore {
  constructor(documents = {}) { this.docs = new Map(); Object.entries(documents).forEach(([path, data]) => this.docs.set(path, data)); }
  doc(path) { return new Ref(this, path); }
  collection(path) { return new Query(this, path); }
  collectionGroup(name) { return new GroupQuery(this, name); }
  async runTransaction(work) { return work({ get: (ref) => ref.get(), update: (ref, data) => ref.update(data), set: (ref, data) => ref.set(data) }); }
  batch() { const ops=[]; return { update:(r,d)=>ops.push(()=>r.update(d)), set:(r,d)=>ops.push(()=>r.set(d)), commit:async()=>Promise.all(ops.map(f=>f())) }; }
}
class Ref {
  constructor(db,path) { this.db=db; this.path=path; this.id=path.split('/').pop(); this.parent={ parent: path.split('/').length > 2 ? new Ref(db,path.split('/').slice(0,-2).join('/')) : null }; }
  collection(id) { return new Query(this.db, `${this.path}/${id}`); }
  async get() { const data=this.db.docs.get(this.path); return { id:this.id, exists:data!==undefined, data:()=>data, ref:this }; }
  async set(data) { this.db.docs.set(this.path, data); }
  async update(data) { const current = { ...(this.db.docs.get(this.path)||{}) }; Object.entries(data).forEach(([key, next]) => { if (next && next.remove !== undefined) current[key] = (current[key] || []).filter((item) => item !== next.remove); else current[key] = next; }); this.db.docs.set(this.path, current); }
}
class Query {
  constructor(db,path,filters=[]) { this.db=db; this.path=path; this.filters=filters; }
  doc(id) { return new Ref(this.db,`${this.path}/${id}`); }
  where(field,op,expected) { return new Query(this.db,this.path,[...this.filters,{field,op,expected}]); }
  async get() { const depth=this.path.split('/').length; const docs=[...this.db.docs.entries()].filter(([p,d])=>p.startsWith(`${this.path}/`) && p.split('/').length===depth+1 && matches(d,this.filters)).map(([p,d])=>({id:p.split('/').pop(),exists:true,data:()=>d,ref:new Ref(this.db,p)})); return {docs,forEach:(f)=>docs.forEach(f),empty:!docs.length}; }
  count() { return { get: async () => { const snapshot = await this.get(); return { data: () => ({ count: snapshot.docs.length }) }; } }; }
}
class GroupQuery extends Query {
  constructor(db,name,filters=[]) { super(db,name,filters); this.name=name; }
  where(field,op,expected) { return new GroupQuery(this.db,this.name,[...this.filters,{field,op,expected}]); }
  async get() { const docs=[...this.db.docs.entries()].filter(([p,d])=>p.split('/').slice(-2,-1)[0]===this.name && matches(d,this.filters)).map(([p,d])=>({id:p.split('/').pop(),exists:true,data:()=>d,ref:new Ref(this.db,p)})); return {docs,forEach:(f)=>docs.forEach(f),empty:!docs.length}; }
}
function materialize(value) { if (Array.isArray(value)) return value.map(materialize); if (value && typeof value==='object') { if (Object.keys(value).length===1 && value.__ts) return new MemoryTimestamp(value.__ts); return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,materialize(v)])); } return value; }
function fromFixture(documents) { return new MemoryFirestore(Object.fromEntries(Object.entries(documents).map(([p,d])=>[p,materialize(d)]))); }
module.exports={MemoryFirestore,MemoryTimestamp,fromFixture,materialize};
