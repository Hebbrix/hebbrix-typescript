import assert from "node:assert/strict";
import test from "node:test";
import { ProofLoopResource } from "../dist/index.mjs";
test("atomic setup and scoped report use one request each",async()=>{
  const calls=[];
  const api=new ProofLoopResource({post:async(...args)=>{calls.push(args);return {revision:1};},get:async(...args)=>{calls.push(args);return {};}});
  const actions={a:{description:"Read logs",target:"sandbox",risk_tier:"low",exploration_allowed:true}};
  await api.setupPolicy("p:key",{context_schema:{version:"v1",fields:{}},actions,collection_id:"c",user_id:"u"});
  assert.deepEqual(calls[0],["/v1/learning/policies/p%3Akey/setup",{context_schema:{version:"v1",fields:{}},collection_id:"c",user_id:"u",configuration:{actions}}]);
  await api.learningReport("p:key",{user_id:"u",days:7});
  assert.deepEqual(calls[1],["/v1/learning/policies/p%3Akey/report",{user_id:"u",days:7}]);
});
test("advisor logs once with actual probabilities and cannot override scope",async()=>{
  const calls=[];let invoked=0;
  const api=new ProofLoopResource({get:async()=>({evidence_card:"untrusted",authorization_granted:false}),post:async(...args)=>{calls.push(args);return {decision_id:"d"};}});
  const choice={chosen_action_key:"b",action_probability:1,behavior_probabilities:{a:0,b:1}};
  const params={policy_key:"p",context:{issue:"slow"},collection_id:"c",user_id:"u",candidates:[{action_key:"a"},{action_key:"b"}],idempotency_key:"once"};
  await api.decideWithAdvice({...params,advisor:async(card)=>{invoked++;assert.equal(card.authorization_granted,false);return choice;}});
  assert.equal(invoked,1);assert.equal(calls.length,1);
  assert.equal(calls[0][1].mode,"observe");assert.equal(calls[0][1].user_id,"u");
  assert.deepEqual(calls[0][1].behavior_probabilities,choice.behavior_probabilities);
  await assert.rejects(api.decideWithAdvice({...params,advisor:async()=>({...choice,user_id:"foreign"})}),/actual complete/);
  assert.equal(calls.length,1);
});
