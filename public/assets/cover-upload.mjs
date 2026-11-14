// Regrava PDFs modernos com tabela xref clássica para o importador PHP local.
export async function prepareCover(file){
    const {PDFDocument}=await import('./vendor/pdf-lib.mjs');
    let doc;
    try{doc=await PDFDocument.load(await file.arrayBuffer(),{updateMetadata:false});}
    catch{throw Error('Não foi possível abrir a capa. Envie um PDF válido sem senha.');}
    if(doc.getPageCount()!==1)throw Error('A capa deve conter exatamente uma página.');
    // Campos preenchidos passam a fazer parte do desenho antes da importação.
    try{const form=doc.getForm();if(form.getFields().length)form.flatten({updateFieldAppearances:false});}
    catch{throw Error('Converta os campos do formulário em conteúdo fixo antes de enviar a capa.');}
    const bytes=await doc.save({useObjectStreams:false,updateFieldAppearances:false});
    if(bytes.length>4*1024*1024)throw Error('A capa preparada supera 4 MB. Reduza o tamanho do PDF.');
    return new Blob([bytes],{type:'application/pdf'});
}
