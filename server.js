// World of Nations 1v1 relay + static host. Render: build `npm install`, start `node server.js`
const http=require('http'),fs=require('fs'),path=require('path');
const srv=http.createServer((q,r)=>{
  if(q.url==='/health'){r.writeHead(200);return r.end('ok')}
  fs.readFile(path.join(__dirname,'world_of_nations_mp.html'),(e,d)=>{
    if(e){r.writeHead(500);return r.end('missing world_of_nations_mp.html')}
    r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(d)})});
const io=require('socket.io')(srv,{cors:{origin:'*'}});
const rooms=new Map(); // code -> {host,guest,map,dur,turns,nat:{1,2},rm:Set}
const NATS=['A','B','C'],nat=n=>NATS.includes(n)?n:'A';
io.on('connection',s=>{
  const room=()=>rooms.get(s.room),peer=()=>{const r=room();return r&&(r.host===s.id?r.guest:r.host)};
  const start=r=>{const base={map:r.map,dur:r.dur,turns:r.turns,nat:r.nat};
    io.to(r.host).emit('start',{...base,role:'host'});io.to(r.guest).emit('start',{...base,role:'guest'})};
  s.on('create',(o,ack)=>{o=o||{};let c;do c=String(1000+Math.random()*9000|0);while(rooms.has(c));
    rooms.set(c,{host:s.id,guest:null,map:Math.min(3,Math.max(0,+o.map||1)),dur:Math.min(5,Math.max(2,+o.dur||3)),turns:o.turns?1:0,nat:{1:nat(o.nat),2:'A'},rm:new Set()});
    s.room=c;ack&&ack({code:c})});
  s.on('join',(o,ack)=>{o=typeof o==='object'&&o?o:{code:o};const r=rooms.get(String(o.code));
    if(!r)return ack&&ack({ok:false,err:'Room not found'});
    if(r.guest)return ack&&ack({ok:false,err:'Room is full'});
    r.guest=s.id;r.nat[2]=nat(o.nat);s.room=String(o.code);ack&&ack({ok:true});start(r)});
  s.on('rematch',()=>{const r=room();if(!r||!r.guest)return;r.rm.add(s.id);
    if(r.rm.has(r.host)&&r.rm.has(r.guest)){r.rm.clear();start(r)}});            // both agreed -> restart in same room
  s.on('cmd',d=>{const r=room();if(r&&r.guest===s.id)io.to(r.host).emit('cmd',d)}); // guest -> host
  s.on('state',d=>{const r=room();if(r&&r.host===s.id&&r.guest)io.to(r.guest).volatile.emit('state',d)}); // host -> guest
  for(const e of['msg','over','abil'])s.on(e,d=>{const r=room();if(r&&r.host===s.id&&r.guest)io.to(r.guest).emit(e,d)}); // host -> guest
  s.on('chat',d=>{if(!d||!(d.k==='q'||d.k==='e')||!(d.i>=0&&d.i<5))return;     // quick chat / emote (whitelisted, rate-limited)
    const n=Date.now();if(n-(s.lc||0)<600)return;s.lc=n;const p=peer();p&&io.to(p).emit('chat',{k:d.k,i:d.i|0})});
  s.on('dip',d=>{if(!d||!['cf','pt','bd'].includes(d.k))return;const p=peer();p&&io.to(p).emit('dip',{k:d.k,m:Math.min(5,Math.max(1,d.m|0||2))})});   // treaty proposal -> opponent
  s.on('dipr',d=>{if(!d||!['cf','pt','bd'].includes(d.k))return;const p=peer();p&&io.to(p).emit('dipr',{k:d.k,m:Math.min(5,Math.max(1,d.m|0||2)),ok:d.ok?1:0})}); // accept/reject
  s.on('disconnect',()=>{const p=peer();p&&io.to(p).emit('opp-left');rooms.delete(s.room)});
});
srv.listen(process.env.PORT||3000,()=>console.log('listening'));
