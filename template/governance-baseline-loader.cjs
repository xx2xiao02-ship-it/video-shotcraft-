const fs=require('node:fs');
module.exports=function(source) {
  const options=this.getOptions();
  const snapshot=options.snapshots[this.resourcePath];
  return snapshot ? fs.readFileSync(snapshot,'utf8') : source;
};
