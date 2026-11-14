export function normalizedStudentId(value){
    const text=String(value??'').trim();return /^\d{1,6}$/.test(text)?text.padStart(6,'0'):null;
}
export function suggestStudent(identity,students,available){
    if(identity?.status!=='recognized'||!/^\d{6}$/.test(identity.value||''))return {status:identity?.status||'legacy',student:null};
    const matches=students.filter(s=>normalizedStudentId(s.external_id)===identity.value);
    if(matches.length!==1)return {status:matches.length?'duplicate':'not_found',student:null};
    const student=matches[0];return available.some(s=>s.id===student.id)?{status:'found',student}:{status:'unavailable',student};
}
