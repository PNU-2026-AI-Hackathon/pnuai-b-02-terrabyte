package com.terrabyte.backend.pot;

import java.util.List;

import com.terrabyte.backend.api.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class PotService {

    private final PotRepository potRepository;

    public PotService(PotRepository potRepository) {
        this.potRepository = potRepository;
    }

    public List<PotResponse> findAll(long userId) {
        return potRepository.findAllOwned(userId).stream().map(PotResponse::from).toList();
    }

    public PotResponse findOne(long userId, long potId) {
        return PotResponse.from(potRepository.findOwned(potId, userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND, "POT_NOT_FOUND", "화분을 찾을 수 없습니다.")));
    }
}
