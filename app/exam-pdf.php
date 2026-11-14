<?php
declare(strict_types=1);
require_once __DIR__.'/vendor/tfpdf/tfpdf.php';
require_once __DIR__.'/vendor/tfpdf/font/unifont/ttfonts.php';

final class ExamPdf extends tFPDF {
    public array $examData=[];
    public string $versionLabel='';
    public bool $teacher=false;
    public int $columns=1;
    private int $column=0;
    private float $top=60;
    private float $bottom=278;
    private array $pageLabels=[];
    public function Header(): void {
        $this->pageLabels[$this->PageNo()]=$this->versionLabel;
        $this->SetTextColor(20,43,40);$this->SetFont('School','B',14);$this->SetXY(14,12);
        $this->MultiCell(182,6,$this->examData['name']);
        $this->SetFont('School','B',11);$this->Cell(182,7,($this->teacher?'GABARITO DO PROFESSOR - ':'PROVA - ').'VERSÃO '.$this->versionLabel,0,1);
        $this->SetFont('School','',9);
        $this->MultiCell(182,4.5,$this->examData['date'].' | Duração: '.$this->examData['duration'].' minutos | '.mb_strimwidth($this->examData['class_name'],0,145,'...'));
        if(!$this->teacher){$this->Ln(3);$this->Cell(182,6,'Estudante: ___________________________________________________ Turma: __________',0,1);$this->MultiCell(182,4.5,'Use o cartão-resposta da versão '.$this->versionLabel.'. Preencha uma alternativa por questão.');}
        else {$this->MultiCell(182,4.5,'Uso exclusivo do professor. Referência = questão na ordem original da seleção.');}
        $this->Ln(3);$this->SetDrawColor(150,170,160);$this->Line(14,$this->GetY(),196,$this->GetY());$this->top=$this->GetY()+5;$this->SetY($this->top);
    }
    public function Footer(): void {
        $this->SetXY(14,284);$this->SetFont('School','',8);$this->SetTextColor(90,105,100);
        $this->Cell(182,5,'Versão '.($this->pageLabels[$this->PageNo()]??$this->versionLabel).' | Página '.$this->PageNo().' | MarioProvas',0,0,'R');
    }
    private function columnWidth(): float {return $this->columns===2?87:182;}
    private function columnX(): float {return 14+$this->column*95;}
    private function nextColumn(): void {
        if($this->columns===2&&$this->column===0){$this->column=1;$this->SetXY($this->columnX(),$this->top);}
        else {$this->column=0;$this->AddPage();$this->SetXY(14,$this->top);}
    }
    public function startVersion(string $label): void {
        $this->versionLabel=$label;$this->column=0;$this->AddPage();
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
        $lines[]=['text'=>'','bold'=>false,'indent'=>0];
        foreach($q['options'] as $i=>$option){$wrapped=$this->wrapText($option,$width-8);foreach($wrapped as $j=>$line)$lines[]=['text'=>($j===0?chr(65+$i).') ':'').$line,'bold'=>false,'indent'=>$j===0?0:6];}
        $height=count($lines)*5+5;
        if($this->GetY()+$height>$this->bottom&&$height<=$this->bottom-$this->top)$this->nextColumn();
        foreach($lines as $line){
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
function export_exam_pdf(int $examId,int $versionId,int $columns,bool $key): never {
    $e=exam($examId);if(!in_array($columns,[1,2],true))fail('Escolha uma ou duas colunas.');
    $versions=exam_versions($examId);if(!$versions)fail('Este simulado não tem enunciados e versões para impressão.');
    if($versionId){$versions=array_values(array_filter($versions,fn($v)=>(int)$v['id']===$versionId));if(!$versions)fail('Versão fora desta prova.',404);}
    if(!$key&&!$versionId)fail('Escolha a versão da prova para baixar.');
    $pdf=new ExamPdf();$pdf->examData=$e;$pdf->teacher=$key;$pdf->columns=$key?1:$columns;
    $pdf->SetMargins(14,12,14);$pdf->SetAutoPageBreak(false);$pdf->AddFont('School','','DejaVuSansCondensed.ttf',true);$pdf->AddFont('School','B','DejaVuSansCondensed-Bold.ttf',true);
    $pdf->SetTitle($e['name'],true);$pdf->SetAuthor('MarioProvas');
    foreach($versions as $v){$content=version_content($examId,(int)$v['id']);$pdf->startVersion($v['label']);if($key)$pdf->key($content['questions']);else foreach($content['questions'] as $q)$pdf->question($q);}
    $bytes=$pdf->Output('S');header('Content-Type: application/pdf');header('Content-Disposition: attachment; filename="'.($key?'gabarito-professor':'prova').'-'.$examId.($versionId?'-'.$versions[0]['label']:'-todas-versoes').'.pdf"');header('Content-Length: '.strlen($bytes));echo $bytes;exit;
}
