<?php
declare(strict_types=1);
require_once __DIR__.'/vendor/tfpdf/tfpdf.php';
require_once __DIR__.'/vendor/fpdi/src/autoload.php';

function exam_cover(string $id,bool $bytes=false): array {
    $u=require_user();if(!preg_match('/^[a-f0-9]{32}$/D',$id))fail('Capa não encontrada.',404);
    $cover=one('SELECT id,name'.($bytes?',data':'').' FROM exam_covers WHERE id=? AND school_id=?',[$id,$u['school_id']]);
    if(!$cover)fail('Capa não encontrada.',404);return $cover;
}
function upload_exam_cover(): array {
    $u=require_user();$file=$_FILES['file']??null;
    if(!$file||$file['error']!==UPLOAD_ERR_OK)fail('Envie um PDF de uma página, de até 4 MB.');
    if($file['size']>4*1024*1024)fail('A capa deve ter até 4 MB.',413);
    $data=file_get_contents($file['tmp_name']);if(!str_starts_with($data,'%PDF-'))fail('Formato inválido. Envie um arquivo PDF.');
    try {
        $pdf=new \setasign\Fpdi\Tfpdf\Fpdi();
        $pages=$pdf->setSourceFile(\setasign\Fpdi\PdfParser\StreamReader::createByString($data));
        if($pages!==1)fail('A capa deve conter exatamente uma página.');
        $tpl=$pdf->importPage(1,\setasign\Fpdi\PdfReader\PageBoundaries::CROP_BOX,true,false);$size=$pdf->getTemplateSize($tpl);
        if($size['width']<10||$size['height']<10||$size['width']>2000||$size['height']>2000)fail('Dimensões da capa inválidas. Use uma página A4.');
        $pdf->AddPage();$pdf->useTemplate($tpl,0,0,210,297);$pdf->Output('S');
    }catch(AppError $e){throw $e;}catch(Throwable $e){fail('Não foi possível abrir este PDF. Envie uma página sem senha, salva como PDF 1.4 (compatível), com campos e anotações convertidos em conteúdo da página.');}
    $name=mb_substr(str_replace(['\\','/'],['_','_'],strval_trim($file['name']??'capa.pdf')),0,180)?:'capa.pdf';$id=bin2hex(random_bytes(16));
    return transaction(function()use($u,$id,$name,$data){
        $s=db()->prepare('INSERT INTO exam_covers(id,school_id,name,data,created_by) VALUES(?,?,?,?,?)');
        $s->bindValue(1,$id);$s->bindValue(2,$u['school_id'],PDO::PARAM_INT);$s->bindValue(3,$name);$s->bindValue(4,$data,PDO::PARAM_LOB);$s->bindValue(5,$u['id'],PDO::PARAM_INT);$s->execute();audit('exam.cover_uploaded');return ['id'=>$id,'name'=>$name];
    });
}
function output_exam_cover(string $id): never {
    $cover=exam_cover($id,true);header('Content-Type: application/pdf');header('Content-Length: '.strlen($cover['data']));header('Content-Disposition: attachment; filename="capa.pdf"');header("Content-Security-Policy: default-src 'none'; sandbox");echo $cover['data'];exit;
}
function pdf_settings(array $body): array {
    $columns=filter_var($body['pdf_columns']??1,FILTER_VALIDATE_INT);if(!in_array($columns,[1,2],true))fail('Escolha uma ou duas colunas.');
    $group=$body['pdf_group_images']??true;if(!is_bool($group))fail('Agrupamento de imagens inválido.');
    $coverId=$body['cover_id']??null;if($coverId!==null){if(!is_string($coverId))fail('Capa inválida.');exam_cover($coverId);}
    return ['pdf_columns'=>$columns,'pdf_group_images'=>$group?1:0,'cover_id'=>$coverId];
}
function save_pdf_settings(array $body): array {
    return transaction(function()use($body){
        $e=exam((int)($body['exam_id']??0));if((int)($body['pdf_revision']??0)!==(int)$e['pdf_revision'])fail('A impressão foi alterada em outra sessão. Reabra a prova para conferir.',409);
        $s=pdf_settings($body);query('UPDATE exams SET pdf_columns=?,pdf_group_images=?,cover_id=?,pdf_revision=pdf_revision+1 WHERE id=?',[$s['pdf_columns'],$s['pdf_group_images'],$s['cover_id'],$e['id']]);audit('exam.pdf_settings_updated',(int)$e['id']);
        return ['message'=>'Configuração de impressão salva.','pdf_revision'=>(int)$e['pdf_revision']+1]+$s;
    });
}
