import {melodies} from './model.js';
import {mediaSource} from './stage.js';
export class CardAudio {
  constructor(){this.ctx=null;this.voice=new Audio();this.music=new Audio();this.music.loop=true;this.playing=false;this.nodes=[];this.timer=null;this.limit=null;}
  async prepare(p){
    this.stop();this.project=p;
    this.voice.removeAttribute('src');this.music.removeAttribute('src');
    if(p.voice?.src)this.voice.src=await mediaSource(p.voice.src);
    if(p.music?.src)this.music.src=await mediaSource(p.music.src);
    this.volume(p.voiceVolume??1,p.musicVolume??.35);
  }
  volume(voice,music){this.voice.volume=voice;this.music.volume=music;if(this.gain)this.gain.gain.value=music*.25;}
  synth(){
    const track=melodies.find(m=>m.id===this.project.music?.key);
    if(!track||track.kind==='file'||!Array.isArray(track.notes))return;
    this.ctx??=new AudioContext();
    this.gain=this.ctx.createGain();this.gain.gain.value=(this.project.musicVolume??.35)*.25;this.gain.connect(this.ctx.destination);
    const playNotes=()=>{
      const start=this.ctx.currentTime+.02;
      track.notes.forEach((freq,i)=>{
        const osc=this.ctx.createOscillator();const env=this.ctx.createGain();
        osc.type='sine';osc.frequency.value=freq;
        env.gain.setValueAtTime(0,start+i*.42);
        env.gain.linearRampToValueAtTime(.8,start+i*.42+.025);
        env.gain.exponentialRampToValueAtTime(.001,start+i*.42+.39);
        osc.connect(env);env.connect(this.gain);osc.start(start+i*.42);osc.stop(start+i*.42+.4);
        this.nodes.push(osc);
      });
    };
    playNotes();this.timer=setInterval(playNotes,track.notes.length*420);
  }
  play(onDone){
    if(this.playing)return;
    this.playing=true;
    if(this.project.music?.key)this.synth();
    if(this.ctx)this.ctx.resume();
    if(this.voice.src)this.voice.play().catch(()=>{});
    if(this.music.src)this.music.play().catch(()=>{});
    if(this.voice.src)this.voice.onended=()=>{this.stop();onDone?.();};
    else this.limit=setTimeout(()=>{this.stop();onDone?.();},30000);
  }
  pause(){
    this.playing=false;clearInterval(this.timer);clearTimeout(this.limit);this.timer=null;this.limit=null;
    this.nodes.forEach(n=>{try{n.stop();}catch{}});this.nodes=[];
    this.voice.pause();this.music.pause();
    if(this.gain){this.gain.disconnect();this.gain=null;}
  }
  stop(){this.pause();this.voice.currentTime=0;this.music.currentTime=0;}
}

