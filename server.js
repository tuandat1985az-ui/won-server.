// Minimal 1v1 relay + static host. Deploy free on Render/Glitch: `npm i && node server.js`
const http=require('http'),fs=require('fs'),path=require('path');
const html=()=>fs.readFileSync(path.join(__dirname,'world_of_nations_mp.html'));
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(html())});
const io=require('socket.io')(srv,{cors:{origin:'*'}});
const rooms=new Map(); // code -> {host,guest,map,dur}
io.on('connection',s=>{
  s.on('create',(o,ack)=>{let c;do c=String(1000+Math.random()*9000|0);while(rooms.has(c));
    rooms.set(c,{host:s.id,guest:null,map:+o.map||1,dur:+o.dur||5});s.room=c;ack&&ack({code:c})});
  s.on('join',(c,ack)=>{const r=rooms.get(String(c));
    if(!r)return ack&&ack({ok:false,err:'Room not found'});
    if(r.guest)return ack&&ack({ok:false,err:'Room is full'});
    r.guest=s.id;s.room=c;ack&&ack({ok:true});
    io.to(r.host).emit('start',{role:'host',map:r.map,dur:r.dur});
    io.to(r.guest).emit('start',{role:'guest',map:r.map,dur:r.dur})});
  const peer=()=>{const r=rooms.get(s.room);return r&&(r.host===s.id?r.guest:r.host)};
  s.on('cmd',d=>{const p=peer();p&&io.to(p).emit('cmd',d)});          // guest -> host
  for(const e of['msg','over'])s.on(e,d=>{const p=peer();p&&io.to(p).emit(e,d)});
  s.on('state',d=>{const p=peer();p&&io.to(p).volatile.emit('state',d)}); // host -> guest
  s.on('disconnect',()=>{const p=peer();p&&io.to(p).emit('opp-left');rooms.delete(s.room)});
});
srv.listen(process.env.PORT||3000,()=>console.log('listening'));
