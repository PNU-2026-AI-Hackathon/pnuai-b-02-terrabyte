package com.terrabyte.backend.irrigation;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Manual irrigation and the decision timeline.
 *
 * <p>The POST goes through {@link IrrigationService} and therefore through the
 * Governor. There is deliberately no endpoint that issues a command directly.
 *
 * <p>A refusal answers 409 rather than 400: the request was well-formed and the
 * server understood it, the current state just does not allow it. The client
 * shows the reason to the user.
 */
@RestController
@RequestMapping("/api/pots/{potId}/irrigation")
public class IrrigationController {

    private final IrrigationService irrigationService;
    private final IrrigationDecisionRepository decisionRepository;

    public IrrigationController(
            IrrigationService irrigationService,
            IrrigationDecisionRepository decisionRepository) {
        this.irrigationService = irrigationService;
        this.decisionRepository = decisionRepository;
    }

    public record ManualIrrigationRequest(
            @Positive(message = "관수량은 0보다 커야 합니다.") int volumeMl,
            boolean cooldownOverride,
            @Size(max = 200, message = "사유는 200자 이하여야 합니다.") String overrideReason) {}

    @PostMapping
    public ResponseEntity<IrrigationOutcome> water(
            @PathVariable long potId, @Valid @RequestBody ManualIrrigationRequest request) {

        IrrigationOutcome outcome = irrigationService.requestManual(
                potId, request.volumeMl(), request.cooldownOverride(), request.overrideReason());

        return outcome.granted()
                ? ResponseEntity.status(HttpStatus.CREATED).body(outcome)
                : ResponseEntity.status(HttpStatus.CONFLICT).body(outcome);
    }

    /**
     * Every decision for this pot, refusals included.
     *
     * <p>Refusals are the point: a pot that is never watered fails silently
     * unless someone can see the reasons stacking up.
     */
    @GetMapping("/timeline")
    public List<IrrigationDecision> timeline(
            @PathVariable long potId,
            @RequestParam(defaultValue = "20") int limit) {
        return decisionRepository.findRecentByPotId(potId, Math.clamp(limit, 1, 100));
    }
}
