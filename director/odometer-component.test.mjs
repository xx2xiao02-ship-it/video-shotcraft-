import test from 'node:test';
import assert from 'node:assert/strict';
import {odometerValue,odometerTiming,validateOdometerProps} from '../demos/data/odometer-digit-roll/odometer-contract.mjs';

test('odometer retains exact zero, decimal digits and explicit trailing zeroes',()=>{
  for (const value of [0,12.34,999999,'99.98','0.00']) assert.equal(odometerValue(value),String(value));
  for (const value of [-1,NaN,Infinity,'1e3','01','1,000','12345.67',0.001,[1200],{toString:()=> '1200'}]) assert.throws(()=>odometerValue(value));
});

test('odometer stagger timing includes 45 fully still frames after label and pulse',()=>{
  for (let digits=1;digits<=6;digits++) {
    const timing=odometerTiming(digits);
    assert.equal(timing.lock,42+(digits-1)*7);
    assert.equal(timing.minFrames-1-timing.labelEnd,45);
    assert.ok(timing.labelEnd>timing.pulseEnd);
  }
  assert.equal(odometerTiming(6).minFrames,144);
});

test('odometer rejects short duration, wrong frame rate and text overflow',()=>{
  const props={value:999999,unit:'万元',label:'业务指标文案完整保留测试',title:'业务指标'};
  assert.doesNotThrow(()=>validateOdometerProps(props,144,30));
  assert.throws(()=>validateOdometerProps(props,143,30));
  assert.throws(()=>validateOdometerProps(props,144,60));
  assert.throws(()=>validateOdometerProps({...props,label:'过'.repeat(13)},144,30));
  assert.throws(()=>validateOdometerProps({...props,unit:'元\n'},144,30));
  assert.throws(()=>validateOdometerProps({label:'缺少终值'},144,30));
});
