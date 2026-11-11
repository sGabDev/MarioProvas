<?php
declare(strict_types=1);
function migrate(PDO $db): void {
    if ((int)$db->query('PRAGMA user_version')->fetchColumn() >= 1) return;
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
        $db->exec('COMMIT');
    } catch (Throwable $e) { $db->exec('ROLLBACK'); throw $e; }
}
