<?php
declare(strict_types=1);
require_once __DIR__.'/vendor/tfpdf/tfpdf.php';
require_once __DIR__.'/vendor/tfpdf/font/unifont/ttfonts.php';
require_once __DIR__.'/vendor/qrcode/qrcode.php';
require_once __DIR__.'/exam-covers.php';

final class ExamPdf extends \setasign\Fpdi\Tfpdf\Fpdi {
    public array $examData=[];
    public string $versionLabel='';
    public bool $teacher=false;
    public int $columns=1;
    private int $column=0;
    private float $top=60;
    private float $bottom=278;
    private array $pageLabels=[];
    private bool $cover=false;
    private array $imageData=[];
    private array $questionImages=[];
    private int $flowColumns=1;
    private float $columnTop=60;
    private float $leftEnd=0;
    private array $coverPages=[];
    private ?string $coverTemplate=null;
    public function setCover(?array $cover): void {
        if(!$cover)return;
        $this->setSourceFile(\setasign\Fpdi\PdfParser\StreamReader::createByString($cover['data']));
        $this->coverTemplate=$this->importPage(1,\setasign\Fpdi\PdfReader\PageBoundaries::CROP_BOX,true,false);
    }
    public function Header(): void {
        $this->pageLabels[$this->PageNo()]=$this->versionLabel;
        if($this->cover){$this->coverPages[$this->PageNo()]=true;$this->SetXY(14,14);return;}
        $this->SetTextColor(20,43,40);$this->SetFont('School','B',14);$this->SetXY(14,12);
        $this->MultiCell(182,6,$this->examData['name']);
        $this->SetFont('School','B',11);$this->Cell(182,7,($this->teacher?'GABARITO DO PROFESSOR - ':($this->cover?'CAPA - ':'PROVA - ')).'VERSÃO '.$this->versionLabel,0,1);
        $this->SetFont('School','',9);
        $this->MultiCell(182,4.5,$this->examData['date'].' | Duração: '.$this->examData['duration'].' minutos | '.mb_strimwidth($this->examData['class_name'],0,145,'...'));
        if(!$this->teacher){$this->Ln(3);$this->Cell(182,6,'Estudante: ___________________________________________________ Turma: __________',0,1);$this->MultiCell(182,4.5,'Use o cartão-resposta da versão '.$this->versionLabel.'. Preencha uma alternativa por questão.');}
        else {$this->MultiCell(182,4.5,'Uso exclusivo do professor. Referência = questão na ordem original da seleção.');}
        $this->Ln(3);$this->SetDrawColor(150,170,160);$this->Line(14,$this->GetY(),196,$this->GetY());$this->top=$this->GetY()+5;$this->columnTop=$this->top;$this->leftEnd=0;$this->SetY($this->top);
    }
    public function Footer(): void {
        if(isset($this->coverPages[$this->PageNo()]))return;
        $this->SetXY(14,284);$this->SetFont('School','',8);$this->SetTextColor(90,105,100);
        $this->Cell(182,5,'Versão '.($this->pageLabels[$this->PageNo()]??$this->versionLabel).' | Página '.$this->PageNo().' | MarioProvas',0,0,'R');
    }
    private function columnWidth(): float {return $this->flowColumns===2?87:182;}
    private function columnX(): float {return 14+$this->column*95;}
    private function nextColumn(): void {
        if($this->flowColumns===2&&$this->column===0){$this->leftEnd=$this->GetY();$this->column=1;$this->SetXY($this->columnX(),$this->columnTop);}
        else {$this->finishColumns();$this->column=0;$this->AddPage();$this->SetXY(14,$this->top);}
    }
    private function finishColumns(): void {
        if($this->flowColumns!==2)return;
        $end=min($this->bottom,max($this->leftEnd,$this->GetY()));
        if($end>$this->columnTop){$this->SetDrawColor(145,155,150);$this->SetLineWidth(.2);$this->Line(105,$this->columnTop,105,$end);}
        $this->SetXY(14,$end);$this->leftEnd=0;$this->column=0;
    }
    private function switchFlow(int $columns): void {
        if($columns===$this->flowColumns)return;
        $this->finishColumns();$this->flowColumns=$columns;$this->column=0;$this->columnTop=$this->GetY();$this->SetX(14);
    }
    public function startVersion(string $label): void {
        $this->versionLabel=$label;$this->column=0;$this->cover=false;
        if($this->teacher)$this->AddPage();
    }
    public function startQuestions(): void {$this->cover=false;$this->column=0;$this->flowColumns=1;$this->AddPage();}
    public function questions(array $questions,bool $groupImages): void {
        if($this->columns===2&&$groupImages)$questions=array_merge(array_values(array_filter($questions,fn($q)=>empty($q['image_id']))),array_values(array_filter($questions,fn($q)=>!empty($q['image_id']))));
        foreach($questions as $q){$this->switchFlow($this->columns===2&&empty($q['image_id'])?2:1);$this->question($q);}
        $this->finishColumns();
    }
    protected function _parsejpg($file) {
        if(!isset($this->imageData[$file]))return parent::_parsejpg($file);
        $data=$this->imageData[$file];$a=getimagesizefromstring($data);$cs=($a['channels']??3)===4?'DeviceCMYK':(($a['channels']??3)===1?'DeviceGray':'DeviceRGB');
        return ['w'=>$a[0],'h'=>$a[1],'cs'=>$cs,'bpc'=>$a['bits']??8,'f'=>'DCTDecode','data'=>$data];
    }
    protected function _parsepng($file) {
        if(!isset($this->imageData[$file]))return parent::_parsepng($file);
        $stream=fopen('php://temp','w+b');try{fwrite($stream,$this->imageData[$file]);rewind($stream);return $this->_parsepngstream($stream,$file);}finally{fclose($stream);}
    }
    private function circle(float $x,float $y,float $r): void {
        $k=$this->k;$cx=$x*$k;$cy=($this->h-$y)*$k;$rr=$r*$k;$d=$rr*.5522847498;
        $this->_out(sprintf('%.3F %.3F m %.3F %.3F %.3F %.3F %.3F %.3F c %.3F %.3F %.3F %.3F %.3F %.3F c %.3F %.3F %.3F %.3F %.3F %.3F c %.3F %.3F %.3F %.3F %.3F %.3F c B',
            $cx+$rr,$cy,$cx+$rr,$cy+$d,$cx+$d,$cy+$rr,$cx,$cy+$rr,$cx-$d,$cy+$rr,$cx-$rr,$cy+$d,$cx-$rr,$cy,$cx-$rr,$cy-$d,$cx-$d,$cy-$rr,$cx,$cy-$rr,$cx+$d,$cy-$rr,$cx+$rr,$cy-$d,$cx+$rr,$cy));
    }
    // Mesmo desenho compacto de layout.mjs, em unidades de 0,2 mm: bolhas de
    // 4 mm, quatro referências e QR com margem branca de quatro módulos.
    private function cardLayout(int $count,int $alternatives): array {
        $cw=44+$alternatives*28;$best=null;
        for($cols=1;$cols<=4;$cols++){$rows=(int)ceil($count/$cols);if($rows>15)continue;$w=max(432,$cols*$cw+64);$h=420+($rows-1)*28+42;if(!$best||$w*$h<$best['w']*$best['h'])$best=['w'=>$w,'h'=>$h,'cols'=>$cols,'rows'=>$rows,'cw'=>$cw];}
        return $best;
    }
    public function answerCover(array $cards): void {
        $this->cover=true;
        foreach($cards as $card){
            $l=$this->cardLayout((int)$card['question_count'],(int)$this->examData['alternatives']);$w=$l['w']*.2;$h=$l['h']*.2;
            $this->AddPage();
            if($this->coverTemplate!==null){$size=$this->getTemplateSize($this->coverTemplate);$scale=min(210/$size['width'],297/$size['height']);$tw=$size['width']*$scale;$th=$size['height']*$scale;$this->useTemplate($this->coverTemplate,(210-$tw)/2,(297-$th)/2,$tw,$th);}
            $x=(210-$w)/2;$y=(297-$h)/2;$this->drawCard($card,$l,$x,$y);
        }
    }
    private function drawCard(array $card,array $l,float $x,float $y): void {
        $s=.2;$this->SetFillColor(255,255,255);$this->Rect($x,$y,$l['w']*$s,$l['h']*$s,'F');$this->SetFillColor(0,0,0);
        foreach([[20,20],[$l['w']-20,20],[$l['w']-20,$l['h']-20],[20,$l['h']-20]] as [$mx,$my])$this->Rect($x+($mx-10)*$s,$y+($my-10)*$s,20*$s,20*$s,'F');
        $qr=new QRCode();$qr->setTypeNumber(3);$qr->setErrorCorrectLevel(QR_ERROR_CORRECT_LEVEL_M);$qr->addData($card['token'],QR_MODE_8BIT_BYTE);$qr->make();$n=$qr->getModuleCount();$mod=104/$n;
        $qx=$l['w']-152;$qy=18;$this->SetFillColor(255,255,255);$this->Rect($x+($qx-4*$mod)*$s,$y+($qy-4*$mod)*$s,(104+8*$mod)*$s,(104+8*$mod)*$s,'F');$this->SetFillColor(0,0,0);
        for($r=0;$r<$n;$r++)for($c=0;$c<$n;$c++)if($qr->isDark($r,$c))$this->Rect($x+($qx+$c*$mod)*$s,$y+($qy+$r*$mod)*$s,($mod+.015)*$s,($mod+.015)*$s,'F');
        $this->SetFont('School','',7.4);$this->SetTextColor(0,0,0);$this->SetXY($x+52*$s,$y+48*$s-1.5);$this->Cell(50,3,'ID / Matrícula (6 dígitos)',0,0);
        for($col=0;$col<6;$col++){
            $this->SetDrawColor(85,85,85);$this->SetLineWidth(.2);$this->Rect($x+(66+$col*28-14)*$s,$y+68*$s,28*$s,24*$s);
            for($digit=0;$digit<10;$digit++){
                $bx=$x+(66+$col*28)*$s;$by=$y+(116+$digit*28)*$s;$this->SetDrawColor(0,0,0);$this->SetLineWidth(.3);$this->SetFillColor(255,255,255);$this->circle($bx,$by,2);
                $this->SetFont('School','',5.1);$this->SetTextColor(170,170,170);$this->SetXY($bx-2,$by-1.1);$this->Cell(4,3,(string)$digit,0,0,'C');
            }
        }
        $this->SetFont('School','',6.8);$this->SetTextColor(50,50,50);
        foreach(['Marque um dígito','por coluna.','Complete com zeros','à esquerda.'] as $i=>$line){$this->SetXY($x+250*$s,$y+(170+$i*22)*$s-1.5);$this->Cell(36,3,$line,0,0);}
        $offset=($l['w']-$l['cols']*$l['cw']-64)/2;$this->SetLineWidth(.3);$this->SetDrawColor(0,0,0);
        for($i=0;$i<$card['question_count'];$i++){
            $cx=78+$offset+intdiv($i,$l['rows'])*$l['cw'];$cy=420+($i%$l['rows'])*28;
            $this->SetFont('School','',6.8);$this->SetTextColor(0,0,0);$this->SetXY($x+($cx-23)*$s-8,$y+$cy*$s-1.1);$this->Cell(8,3,(string)($card['start_number']+$i),0,0,'R');
            for($a=0;$a<$this->examData['alternatives'];$a++){
                $bx=$x+($cx+$a*28)*$s;$by=$y+$cy*$s;$this->SetFillColor(255,255,255);$this->circle($bx,$by,2);
                $this->SetFont('School','',5.1);$this->SetTextColor(170,170,170);$this->SetXY($bx-2,$by-1.1);$this->Cell(4,3,chr(65+$a),0,0,'C');
            }
        }
        $this->SetTextColor(20,35,30);$this->SetDrawColor(150,170,160);$this->SetLineWidth(.2);
        // Identificação faz parte do cartão, sem cabeçalho ou rodapé na capa.
        $this->SetFont('School','',6);$this->SetXY($x+52*$s,$y+15*$s);$this->Cell(40,3,'Versão '.$this->versionLabel.' | Bloco '.$card['page'].' | Q'.$card['start_number'].'-'.($card['start_number']+$card['question_count']-1),0,0);
    }
    private function wrapText(string $text,float $width): array {
        $out=[];$text=str_replace(["\r","\t"],['','    '],$text);
        foreach(explode("\n",$text) as $paragraph){
            $line='';foreach(mb_str_split($paragraph) as $char){if($line!==''&&$this->GetStringWidth($line.$char)>$width){$space=mb_strrpos($line,' ');if($space!==false&&$space>0){$out[]=mb_substr($line,0,$space);$line=ltrim(mb_substr($line,$space+1).$char);}else{$out[]=rtrim($line);$line=ltrim($char);}}else $line.=$char;}$out[]=$line;
        }
        return $out;
    }
    public function question(array $q): void {
        $width=$this->columnWidth();$lines=[];
        $this->SetFont('School','B',10);
        foreach($this->wrapText('Questão '.$q['position'].' - '.$q['discipline'],$width-2) as $line)$lines[]=['text'=>$line,'bold'=>true,'indent'=>0];
        $this->SetFont('School','',10);
        foreach($this->wrapText($q['statement'],$width-2) as $line)$lines[]=['text'=>$line,'bold'=>false,'indent'=>0];
        if(!empty($q['image_id'])){
            $id=$q['image_id'];if(!isset($this->questionImages[$id]))$this->questionImages[$id]=question_image($id,true);$image=$this->questionImages[$id];
            $scale=min(min($width-2,145)/$image['width'],90/$image['height'],.2645833);$lines[]=['image'=>$image,'w'=>$image['width']*$scale,'h'=>$image['height']*$scale+4];
        }
        $lines[]=['text'=>'','bold'=>false,'indent'=>0];
        foreach($q['options'] as $i=>$option){$wrapped=$this->wrapText($option,$width-8);foreach($wrapped as $j=>$line)$lines[]=['text'=>($j===0?chr(65+$i).') ':'').$line,'bold'=>false,'indent'=>$j===0?0:6];}
        $height=array_sum(array_map(fn($line)=>isset($line['image'])?$line['h']:5,$lines))+5;
        if($this->GetY()+$height>$this->bottom&&$height<=$this->bottom-$this->top)$this->nextColumn();
        foreach($lines as $line){
            if(isset($line['image'])){
                if($this->GetY()+$line['h']>$this->bottom)$this->nextColumn();$image=$line['image'];$key='question-'.$image['id'];$this->imageData[$key]=$image['data'];
                $this->Image($key,$this->columnX()+($width-$line['w'])/2,$this->GetY()+2,$line['w'],$line['h']-4,$image['mime']==='image/png'?'PNG':'JPG');$this->SetY($this->GetY()+$line['h']);continue;
            }
            if($this->GetY()+5>$this->bottom){$this->nextColumn();$this->SetFont('School','B',8);$this->SetX($this->columnX());$this->Cell($width,5,'Questão '.$q['position'].' (continuação)',0,1);}
            $this->SetFont('School',$line['bold']?'B':'',10);$this->SetTextColor(20,35,30);$this->SetX($this->columnX()+$line['indent']);$this->Cell($width-$line['indent'],5,$line['text'],0,1);
        }
        $this->Ln(5);
    }
    public function key(array $qs): void {
        $this->SetFont('School','',10);
        foreach($qs as $q){if($this->GetY()+7>$this->bottom)$this->AddPage();$this->SetX(14);$this->Cell(182,7,'Questão '.$q['position'].'   |   '.($q['annulled']?'ANULADA':$q['answer']).'   |   Referência: '.$q['original_number'].'   |   '.mb_strimwidth($q['discipline'],0,55,'...'),0,1);}
    }
}
function export_exam_pdf(int $examId,int $versionId,?int $columns,bool $key,array $overrides=[],bool $coverOnly=false): never {
    $e=exam($examId);$columns??=(int)$e['pdf_columns'];if(!in_array($columns,[1,2],true))fail('Escolha uma ou duas colunas.');
    $settings=pdf_settings(['pdf_columns'=>$columns,'pdf_group_images'=>isset($overrides['group_images'])?$overrides['group_images']==='1':(bool)$e['pdf_group_images'],'cover_id'=>array_key_exists('cover',$overrides)?($overrides['cover']==='none'?null:$overrides['cover']):$e['cover_id']]);
    $versions=exam_versions($examId);if(!$versions)fail('Este simulado não tem enunciados e versões para impressão.');
    if($versionId){$versions=array_values(array_filter($versions,fn($v)=>(int)$v['id']===$versionId));if(!$versions)fail('Versão fora desta prova.',404);}
    $pdf=new ExamPdf();$pdf->examData=$e;$pdf->teacher=$key;$pdf->columns=$key?1:$columns;
    if(!$key&&$settings['cover_id'])$pdf->setCover(exam_cover($settings['cover_id'],true));
    $pdf->SetMargins(14,12,14);$pdf->SetAutoPageBreak(false);$pdf->AddFont('School','','DejaVuSansCondensed.ttf',true);$pdf->AddFont('School','B','DejaVuSansCondensed-Bold.ttf',true);
    $pdf->SetTitle($e['name'],true);$pdf->SetAuthor('MarioProvas');
    foreach($versions as $v){$content=version_content($examId,(int)$v['id']);$pdf->startVersion($v['label']);if($key)$pdf->key($content['questions']);else{$cards=rows('SELECT * FROM cards WHERE booklet_id=? ORDER BY page',[$v['booklet_id']]);$pdf->answerCover($cards);if(!$coverOnly){$pdf->startQuestions();$pdf->questions($content['questions'],(bool)$settings['pdf_group_images']);}}}
    $bytes=$pdf->Output('S');header('Content-Type: application/pdf');header('Content-Disposition: attachment; filename="'.($key?'gabarito-professor':($coverOnly?'capa':'prova')).'-'.$examId.($versionId?'-'.$versions[0]['label']:'-todas-versoes').'.pdf"');header('Content-Length: '.strlen($bytes));echo $bytes;exit;
}
