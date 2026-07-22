package com.terrabyte.backend.score;

import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class CropScoreProfileRepository {

    private final JdbcTemplate jdbcTemplate;

    public CropScoreProfileRepository(@Qualifier("scoreJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<CropScoreProfile> findActiveByCropCode(String cropCode) {
        return jdbcTemplate.query("""
                        SELECT p.crop_code, p.crop_name_ko,
                               p.temperature_zero_low_c, p.temperature_optimal_low_c,
                               p.temperature_optimal_high_c, p.temperature_zero_high_c,
                               p.humidity_zero_low_pct, p.humidity_optimal_low_pct,
                               p.humidity_optimal_high_pct, p.humidity_zero_high_pct,
                               p.ppfd_zero_low_umol_m2_s, p.ppfd_optimal_low_umol_m2_s,
                               p.ppfd_optimal_high_umol_m2_s, p.ppfd_zero_high_umol_m2_s
                        FROM crop_score_profile p
                        JOIN crop_score_profile_activation a
                          ON a.crop_code = p.crop_code AND a.profile_id = p.profile_id
                        WHERE p.crop_code = ?
                        """,
                        (resultSet, rowNumber) -> new CropScoreProfile(
                                resultSet.getString("crop_code"),
                                resultSet.getString("crop_name_ko"),
                                resultSet.getDouble("temperature_zero_low_c"),
                                resultSet.getDouble("temperature_optimal_low_c"),
                                resultSet.getDouble("temperature_optimal_high_c"),
                                resultSet.getDouble("temperature_zero_high_c"),
                                resultSet.getDouble("humidity_zero_low_pct"),
                                resultSet.getDouble("humidity_optimal_low_pct"),
                                resultSet.getDouble("humidity_optimal_high_pct"),
                                resultSet.getDouble("humidity_zero_high_pct"),
                                resultSet.getDouble("ppfd_zero_low_umol_m2_s"),
                                resultSet.getDouble("ppfd_optimal_low_umol_m2_s"),
                                resultSet.getDouble("ppfd_optimal_high_umol_m2_s"),
                                resultSet.getDouble("ppfd_zero_high_umol_m2_s")),
                        cropCode)
                .stream()
                .findFirst();
    }
}
