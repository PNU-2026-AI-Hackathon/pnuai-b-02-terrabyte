package com.terrabyte.backend.pot;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreatePotRequest(
        @NotBlank(message = "화분 이름을 입력해 주세요.")
        @Size(max = 100, message = "화분 이름은 100자 이하여야 합니다.")
        String label,

        @Size(max = 64, message = "화분 노드 ID는 64자 이하여야 합니다.")
        String nodeId,

        @Size(max = 50, message = "작물 코드는 50자 이하여야 합니다.")
        String cropCode) {
}
