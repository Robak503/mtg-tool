import { pathToFileURL } from "node:url";
const APP="C:/Users/colto/Documents/Claude/Projects/MTG-TOOL/.claude/worktrees/eager-satoshi-dd36e7/app";
const u=(r)=>pathToFileURL(`${APP}/${r}`).href;
const {parseEffectProgram}=await import(u("src/lib/learn/effects/parser.js"));
const p=parseEffectProgram({type:"Instant",mana:"{G}",name:"X",oracle:"Put a +1/+1 counter on up to one target creature you control."});
console.log("counter clause program:", JSON.stringify(p?.atoms));
