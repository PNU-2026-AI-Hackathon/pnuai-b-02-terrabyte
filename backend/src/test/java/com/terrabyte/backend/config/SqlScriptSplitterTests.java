package com.terrabyte.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

/**
 * The splitter exists because sqlite-jdbc runs only the first statement of a
 * multi-statement script and discards the rest without raising. These tests pin
 * the cases that made the naive approaches fail.
 */
class SqlScriptSplitterTests {

    @Test
    void splitsPlainStatements() {
        List<String> statements = SqlScriptSplitter.split(
                "CREATE TABLE one(x);\nCREATE TABLE two(y);\n");

        assertThat(statements).hasSize(2);
        assertThat(statements.get(0)).startsWith("CREATE TABLE one");
        assertThat(statements.get(1)).startsWith("CREATE TABLE two");
    }

    /** A trigger body carries its own separators. */
    @Test
    void keepsATriggerBodyWhole() {
        List<String> statements = SqlScriptSplitter.split("""
                CREATE TRIGGER t BEFORE UPDATE ON x BEGIN
                  SELECT RAISE(ABORT,'no');
                END;
                CREATE TABLE after_it(y);
                """);

        assertThat(statements).hasSize(2);
        assertThat(statements.get(0)).contains("RAISE(ABORT,'no')").endsWith("END;");
        assertThat(statements.get(1)).startsWith("CREATE TABLE after_it");
    }

    /**
     * The schema's guard triggers close a CASE before they close the body. An
     * END-counting splitter that ignores CASE cuts the statement in half and the
     * driver reports "incomplete input".
     */
    @Test
    void aCaseInsideATriggerDoesNotEndTheBody() {
        List<String> statements = SqlScriptSplitter.split("""
                CREATE TRIGGER guard
                BEFORE UPDATE OF status ON v
                WHEN NEW.status='accepted' BEGIN
                  SELECT CASE WHEN OLD.status <> 'draft'
                    THEN RAISE(ABORT,'only a draft can be accepted') END;
                  SELECT CASE WHEN 1 <> 2 THEN RAISE(ABORT,'mismatch') END;
                END;
                CREATE TABLE after_it(y);
                """);

        assertThat(statements).hasSize(2);
        assertThat(statements.get(0)).startsWith("CREATE TRIGGER guard").endsWith("END;");
        assertThat(statements.get(1)).startsWith("CREATE TABLE after_it");
    }

    /**
     * BEGIN IMMEDIATE opens a transaction, not a block. Treating it as a block
     * would swallow an entire migration into one fragment that never closes.
     */
    @Test
    void transactionControlStaysItsOwnStatement() {
        List<String> statements = SqlScriptSplitter.split(
                "BEGIN IMMEDIATE;\nUPDATE t SET x = 1;\nCOMMIT;\n");

        assertThat(statements).containsExactly(
                "BEGIN IMMEDIATE;", "UPDATE t SET x = 1;", "COMMIT;");
    }

    @Test
    void separatorsInsideStringsAndCommentsAreNotSplitPoints() {
        List<String> statements = SqlScriptSplitter.split("""
                INSERT INTO t VALUES ('a;b', 'it''s; fine');
                -- a comment; with a separator
                CREATE TABLE two(y);
                """);

        assertThat(statements).hasSize(2);
        assertThat(statements.get(0)).contains("'a;b'").contains("'it''s; fine'");
        assertThat(statements.get(1)).startsWith("CREATE TABLE two");
    }

    @Test
    void trailingCommentsAndBlankLinesProduceNoStatement() {
        assertThat(SqlScriptSplitter.split("CREATE TABLE one(x);\n\n-- done\n")).hasSize(1);
        assertThat(SqlScriptSplitter.split("-- nothing here\n")).isEmpty();
        assertThat(SqlScriptSplitter.split("")).isEmpty();
    }

    /**
     * The real schema, not a sample. This is the test that would have caught the
     * original bug: it asserts the whole file becomes many statements and that
     * every trigger survives intact.
     */
    @Test
    void theShippedSchemaSplitsIntoManyStatements() throws Exception {
        String schema = new String(
                new ClassPathResource("db/sqlite/schema.sql").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8);

        List<String> statements = SqlScriptSplitter.split(schema);

        assertThat(statements).hasSizeGreaterThan(50);
        assertThat(statements.get(0)).isEqualTo("PRAGMA foreign_keys = ON;");

        long triggers = statements.stream()
                .filter(statement -> statement.toUpperCase().startsWith("CREATE TRIGGER"))
                .peek(statement -> assertThat(statement).endsWith("END;"))
                .count();
        assertThat(triggers).isEqualTo(10);

        // Nothing may be left dangling: a fragment that does not end in ';' is a
        // statement the splitter cut in the wrong place.
        assertThat(statements).allSatisfy(statement -> assertThat(statement).endsWith(";"));
    }
}
