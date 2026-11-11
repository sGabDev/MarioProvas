<?php
declare(strict_types=1);
function migrate(PDO $db): void {
    if ((int)$db->query('PRAGMA user_version')->fetchColumn() >= 2) return;
    $db->exec('BEGIN IMMEDIATE');
    try {
        if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 1) {
            $columns = [
                'classes' => ['grade_name' => "TEXT NOT NULL DEFAULT ''"],
                'booklets' => ['reusable' => 'INTEGER NOT NULL DEFAULT 0', 'template_id' => 'INTEGER REFERENCES booklets(id)'],
                'enrollments' => ['class_id' => 'INTEGER REFERENCES classes(id)'],
            ];
            foreach ($columns as $table => $definitions) {
                $known = array_column($db->query('PRAGMA table_info('.$table.')')->fetchAll(), 'name');
                foreach ($definitions as $name => $definition) {
                    if (!in_array($name, $known, true)) $db->exec('ALTER TABLE '.$table.' ADD COLUMN '.$name.' '.$definition);
                }
            }
            $db->exec('CREATE TABLE IF NOT EXISTS exam_classes(exam_id INTEGER NOT NULL REFERENCES exams(id),class_id INTEGER NOT NULL REFERENCES classes(id),PRIMARY KEY(exam_id,class_id))');
            $db->exec('INSERT OR IGNORE INTO exam_classes(exam_id,class_id) SELECT id,class_id FROM exams');
            $db->exec('UPDATE enrollments SET class_id=(SELECT s.class_id FROM students s WHERE s.id=enrollments.student_id) WHERE class_id IS NULL');
            $db->exec('CREATE INDEX IF NOT EXISTS booklets_template ON booklets(template_id)');
            $db->exec('CREATE INDEX IF NOT EXISTS exam_classes_class ON exam_classes(class_id,exam_id)');
            $db->exec('PRAGMA user_version=1');
        }
        if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 2) {
            $columns = [
                'exams'=>['grading_policy'=>'TEXT', 'annulment_mode'=>"TEXT NOT NULL DEFAULT 'credit'", 'revision'=>'INTEGER NOT NULL DEFAULT 1'],
                'questions'=>['annulled'=>'INTEGER NOT NULL DEFAULT 0'],
                'results'=>['grade'=>'REAL', 'credited'=>'INTEGER NOT NULL DEFAULT 0'],
            ];
            foreach ($columns as $table=>$definitions) {
                $known=array_column($db->query('PRAGMA table_info('.$table.')')->fetchAll(),'name');
                foreach($definitions as $name=>$definition) if(!in_array($name,$known,true))$db->exec('ALTER TABLE '.$table.' ADD COLUMN '.$name.' '.$definition);
            }
            $sql=(string)$db->query("SELECT sql FROM sqlite_master WHERE name='responses'")->fetchColumn();
            if(!str_contains($sql,"'annulled'")) {
                $db->exec("CREATE TABLE responses_v2(result_id INTEGER NOT NULL REFERENCES results(id),question_id INTEGER NOT NULL REFERENCES questions(id),marked TEXT,status TEXT NOT NULL CHECK(status IN ('correct','incorrect','blank','multiple','annulled')),PRIMARY KEY(result_id,question_id))");
                $db->exec('INSERT INTO responses_v2 SELECT result_id,question_id,marked,status FROM responses');
                $db->exec('DROP TABLE responses');
                $db->exec('ALTER TABLE responses_v2 RENAME TO responses');
            }
            // Branco/múltiplas continuam preservados como motivo da resposta,
            // mas passam a contar como incorretos, dentro das questões válidas.
            $db->exec("UPDATE results SET correct=(SELECT COUNT(*) FROM responses rp WHERE rp.result_id=results.id AND rp.status='correct'), valid=(SELECT COUNT(*) FROM responses rp WHERE rp.result_id=results.id),annulled=0,credited=0 WHERE EXISTS(SELECT 1 FROM responses rp WHERE rp.result_id=results.id)");
            $db->exec('UPDATE results SET percentage=CASE WHEN valid>0 THEN ROUND(100.0*correct/valid,2) ELSE NULL END');
            $db->exec('PRAGMA user_version=2');
        }
        $db->exec('COMMIT');
    } catch (Throwable $e) { $db->exec('ROLLBACK'); throw $e; }
}
