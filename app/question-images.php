<?php
declare(strict_types=1);

function question_image(string $id,bool $bytes=false): array {
    $u=require_user();if(!preg_match('/^[a-f0-9]{32}$/D',$id))fail('Imagem não encontrada.',404);
    $image=one('SELECT id,school_id,mime,width,height'.($bytes?',data':'').' FROM question_images WHERE id=? AND school_id=?',[$id,$u['school_id']]);
    if(!$image)fail('Imagem não encontrada.',404);return $image;
}
function upload_question_image(): array {
    $u=require_user();$file=$_FILES['file']??null;
    if(!$file||$file['error']!==UPLOAD_ERR_OK)fail('Envie uma imagem PNG ou JPEG de até 4 MB.');
    if($file['size']>4*1024*1024)fail('A imagem deve ter até 4 MB.',413);
    $data=file_get_contents($file['tmp_name']);$info=@getimagesizefromstring($data);
    if(!$info||!in_array($info[2],[IMAGETYPE_PNG,IMAGETYPE_JPEG],true))fail('Formato inválido. Envie uma imagem PNG ou JPEG.');
    if($info[0]<1||$info[1]<1||$info[0]>4000||$info[1]>4000||$info[0]*$info[1]>4000000)fail('Imagem muito grande. Reduza para até 4 megapixels e 4000 pixels por lado.');
    if($info[2]===IMAGETYPE_PNG&&(ord($data[24])>8||ord($data[28])!==0))fail('Este PNG usa um formato especial. Salve-o como JPEG ou PNG de 8 bits sem entrelaçamento.');
    $id=bin2hex(random_bytes(16));$mime=$info[2]===IMAGETYPE_PNG?'image/png':'image/jpeg';
    return transaction(function()use($u,$id,$mime,$info,$data){
        $s=db()->prepare('INSERT INTO question_images(id,school_id,mime,width,height,data,created_by) VALUES(?,?,?,?,?,?,?)');
        foreach([$id,$u['school_id'],$mime,$info[0],$info[1]] as $i=>$v)$s->bindValue($i+1,$v);$s->bindValue(6,$data,PDO::PARAM_LOB);$s->bindValue(7,$u['id'],PDO::PARAM_INT);$s->execute();audit('question.image_uploaded');return ['id'=>$id,'mime'=>$mime,'width'=>$info[0],'height'=>$info[1]];
    });
}
function output_question_image(string $id): never {
    $image=question_image($id,true);header('Content-Type: '.$image['mime']);header('Content-Length: '.strlen($image['data']));header('Content-Security-Policy: default-src \'none\'; sandbox');echo $image['data'];exit;
}
