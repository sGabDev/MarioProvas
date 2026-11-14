<?php
declare(strict_types=1);
function migrate(PDO $db): void {
    if ((int)$db->query('PRAGMA user_version')->fetchColumn() >= 7) return;
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
        if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 3) {
            $db->exec("CREATE TABLE IF NOT EXISTS question_bank(id INTEGER PRIMARY KEY,school_id INTEGER NOT NULL REFERENCES schools(id),statement TEXT NOT NULL,options TEXT NOT NULL,answer TEXT NOT NULL,discipline TEXT NOT NULL,area TEXT NOT NULL,subject TEXT NOT NULL,difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),revision INTEGER NOT NULL DEFAULT 1,archived INTEGER NOT NULL DEFAULT 0,created_by INTEGER NOT NULL REFERENCES users(id),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
            $db->exec('CREATE INDEX IF NOT EXISTS bank_school ON question_bank(school_id,archived,discipline,area,subject,difficulty)');
            if(!in_array('duration',array_column($db->query('PRAGMA table_info(exams)')->fetchAll(),'name'),true))$db->exec('ALTER TABLE exams ADD COLUMN duration INTEGER');
            if(!in_array('discipline',array_column($db->query('PRAGMA table_info(questions)')->fetchAll(),'name'),true))$db->exec("ALTER TABLE questions ADD COLUMN discipline TEXT NOT NULL DEFAULT ''");
            $db->exec('CREATE TABLE IF NOT EXISTS question_snapshots(question_id INTEGER PRIMARY KEY REFERENCES questions(id),source_id INTEGER REFERENCES question_bank(id),source_revision INTEGER NOT NULL,statement TEXT NOT NULL,options TEXT NOT NULL,area TEXT NOT NULL,subject TEXT NOT NULL,difficulty TEXT NOT NULL,fixed_position INTEGER NOT NULL DEFAULT 0,fixed_options TEXT NOT NULL)');
            $db->exec('CREATE TABLE IF NOT EXISTS exam_versions(id INTEGER PRIMARY KEY,exam_id INTEGER NOT NULL REFERENCES exams(id),label TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(exam_id,label))');
            $db->exec('CREATE TABLE IF NOT EXISTS version_questions(version_id INTEGER NOT NULL REFERENCES exam_versions(id),position INTEGER NOT NULL,question_id INTEGER NOT NULL REFERENCES questions(id),choice_order TEXT NOT NULL,PRIMARY KEY(version_id,position),UNIQUE(version_id,question_id))');
            if(!in_array('version_id',array_column($db->query('PRAGMA table_info(booklets)')->fetchAll(),'name'),true))$db->exec('ALTER TABLE booklets ADD COLUMN version_id INTEGER REFERENCES exam_versions(id)');
            $db->exec('CREATE UNIQUE INDEX IF NOT EXISTS version_template ON booklets(version_id) WHERE reusable=1 AND template_id IS NULL');
            $db->exec('PRAGMA user_version=3');
        }
        if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 4) {
            $db->exec('CREATE TABLE IF NOT EXISTS question_images(id TEXT PRIMARY KEY,school_id INTEGER NOT NULL REFERENCES schools(id),mime TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,data BLOB NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
            foreach(['question_bank'=>['image_id'=>'TEXT REFERENCES question_images(id)'],'question_snapshots'=>['image_id'=>'TEXT REFERENCES question_images(id)'],'exams'=>['pdf_columns'=>'INTEGER NOT NULL DEFAULT 1']] as $table=>$definitions){
                $known=array_column($db->query('PRAGMA table_info('.$table.')')->fetchAll(),'name');
                foreach($definitions as $name=>$definition)if(!in_array($name,$known,true))$db->exec('ALTER TABLE '.$table.' ADD COLUMN '.$name.' '.$definition);
            }
            $db->exec('PRAGMA user_version=4');
        }
        if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 5) {
            $known=array_column($db->query('PRAGMA table_info(cards)')->fetchAll(),'name');
            foreach(['student_id_scores','detected_external_id','identity_method','id_status'] as $name)if(!in_array($name,$known,true))$db->exec('ALTER TABLE cards ADD COLUMN '.$name.' TEXT');
            $db->exec('PRAGMA user_version=5');
        }
        if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 6) {
            $db->exec('CREATE TABLE IF NOT EXISTS exam_covers(id TEXT PRIMARY KEY,school_id INTEGER NOT NULL REFERENCES schools(id),name TEXT NOT NULL,data BLOB NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
            $known=array_column($db->query('PRAGMA table_info(exams)')->fetchAll(),'name');
            foreach(['cover_id'=>'TEXT REFERENCES exam_covers(id)','pdf_group_images'=>'INTEGER NOT NULL DEFAULT 1','pdf_revision'=>'INTEGER NOT NULL DEFAULT 1'] as $name=>$definition)if(!in_array($name,$known,true))$db->exec('ALTER TABLE exams ADD COLUMN '.$name.' '.$definition);
            $db->exec('PRAGMA user_version=6');
        }
        if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 7) {
            $known=array_column($db->query('PRAGMA table_info(users)')->fetchAll(),'name');
            // A flag mantém compatibilidade com o CHECK legado admin/teacher.
            $columns=['phone'=>"TEXT NOT NULL DEFAULT ''",'knowledge_area'=>"TEXT NOT NULL DEFAULT ''",'discipline'=>"TEXT NOT NULL DEFAULT ''",'shifts'=>"TEXT NOT NULL DEFAULT '[]'",'status'=>"TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','blocked','rejected'))",'is_operator'=>'INTEGER NOT NULL DEFAULT 0 CHECK(is_operator IN (0,1))','auth_version'=>'INTEGER NOT NULL DEFAULT 1','profile_revision'=>'INTEGER NOT NULL DEFAULT 1','registered_at'=>'TEXT','approved_at'=>'TEXT','approved_by'=>'INTEGER REFERENCES users(id)'];
            foreach($columns as $name=>$definition)if(!in_array($name,$known,true))$db->exec('ALTER TABLE users ADD COLUMN '.$name.' '.$definition);
            $db->exec('PRAGMA user_version=7');
        }
        $db->exec('COMMIT');
    } catch (Throwable $e) { $db->exec('ROLLBACK'); throw $e; }
}
