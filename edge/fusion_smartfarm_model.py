"""Autodesk Fusion script: detachable low-profile home smart-farm prototype.

Run this file from Fusion's Scripts and Add-Ins dialog.  All source dimensions
are millimetres; Fusion API geometry is converted to its internal centimetres.

A short herb planter rests on a low tray above a side-loading heating cassette.
The lighting arch lifts from rim clips, while the handled irrigation tank lifts
from its own dock.  The model is a concept prototype rather than a production-
ready enclosure.  Edit CONFIG and the build_* methods, rerun, and inspect it.
"""

from __future__ import annotations

import traceback

import adsk.core
import adsk.fusion


# -----------------------------------------------------------------------------
# User-editable prototype controls (millimetres)
# -----------------------------------------------------------------------------

CONFIG = {
    "base": {"width": 430.0, "depth": 280.0, "height": 20.0},
    "planter": {
        "width": 200.0,
        "depth": 160.0,
        "height": 85.0,
        "wall": 5.0,
        "bottom": 7.0,
        "corner_radius": 18.0,
    },
    # Separates the three removable modules for a presentation view.
    "exploded_view": False,
    # A fresh design prevents the script from modifying an open user document.
    "create_new_document": True,
    "show_completion_dialog": True,
}


PALETTE = {
    "platform": (224, 222, 214),
    "platform_dark": (92, 96, 94),
    "white": (244, 242, 234),
    "black": (35, 39, 39),
    "soil": (83, 58, 42),
    "plant": (83, 139, 87),
    "plant_light": (130, 174, 108),
    "pcb": (32, 117, 104),
    "sensor": (47, 90, 74),
    "metal": (151, 157, 158),
    "heating": (222, 92, 58),
    "heating_dark": (128, 48, 37),
    "lighting": (244, 184, 67),
    "water": (54, 160, 190),
    "water_dark": (32, 105, 139),
    "clear": (205, 225, 228),
    "accent": (230, 134, 55),
}


def mm(value: float) -> float:
    """Convert millimetres to Fusion API internal centimetres."""

    return value / 10.0


def point(x: float, y: float, z: float) -> adsk.core.Point3D:
    return adsk.core.Point3D.create(mm(x), mm(y), mm(z))


def vector(x: float, y: float, z: float) -> adsk.core.Vector3D:
    return adsk.core.Vector3D.create(mm(x), mm(y), mm(z))


class SmartFarmBuilder:
    """Builds the concept assembly from simple, robust B-Rep primitives."""

    def __init__(self, app: adsk.core.Application, design: adsk.fusion.Design):
        self.app = app
        self.design = design
        self.root = design.rootComponent
        self.temp = adsk.fusion.TemporaryBRepManager.get()
        self.x_direction = adsk.core.Vector3D.create(1, 0, 0)
        self.y_direction = adsk.core.Vector3D.create(0, 1, 0)
        self.appearances = {}
        self.body_count = 0
        self.component_count = 0
        self._appearance_source = self._find_colorable_appearance()
        self._create_palette()

    # ------------------------------------------------------------------
    # Appearance helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _color_properties(appearance):
        properties = appearance.appearanceProperties
        result = []
        for index in range(properties.count):
            color_property = adsk.core.ColorProperty.cast(properties.item(index))
            if color_property:
                result.append(color_property)
        return result

    def _find_colorable_appearance(self):
        """Find a library appearance that can safely be copied and recoloured."""

        fallback = None
        preferred_tokens = ("plastic - matte", "plastic", "paint", "generic")
        libraries = self.app.materialLibraries
        for library_index in range(libraries.count):
            library = libraries.item(library_index)
            appearances = library.appearances
            for appearance_index in range(appearances.count):
                appearance = appearances.item(appearance_index)
                try:
                    if not self._color_properties(appearance):
                        continue
                    if fallback is None:
                        fallback = appearance
                    if any(token in appearance.name.lower() for token in preferred_tokens):
                        return appearance
                except Exception:
                    continue
        return fallback

    def _create_palette(self):
        if not self._appearance_source:
            return
        for key, rgb in PALETTE.items():
            name = "SmartFarm_{}".format(key)
            appearance = self.design.appearances.itemByName(name)
            if not appearance:
                try:
                    appearance = self.design.appearances.addByCopy(
                        self._appearance_source, name
                    )
                except Exception:
                    appearance = None
            if appearance:
                color = adsk.core.Color.create(rgb[0], rgb[1], rgb[2], 255)
                for color_property in self._color_properties(appearance):
                    try:
                        color_property.value = color
                    except Exception:
                        pass
                self.appearances[key] = appearance

    # ------------------------------------------------------------------
    # Geometry primitives
    # ------------------------------------------------------------------

    def _box_temp(self, x, y, z, size_x, size_y, size_z):
        centre = point(
            x + size_x / 2.0,
            y + size_y / 2.0,
            z + size_z / 2.0,
        )
        oriented_box = adsk.core.OrientedBoundingBox3D.create(
            centre,
            self.x_direction,
            self.y_direction,
            mm(size_x),
            mm(size_y),
            mm(size_z),
        )
        body = self.temp.createBox(oriented_box)
        if not body:
            raise RuntimeError("Temporary box creation failed")
        return body

    def _cylinder_temp(self, start, end, radius_start, radius_end=None):
        if radius_end is None:
            radius_end = radius_start
        body = self.temp.createCylinderOrCone(
            point(*start),
            mm(radius_start),
            point(*end),
            mm(radius_end),
        )
        if not body:
            raise RuntimeError("Temporary cylinder/cone creation failed")
        return body

    def _rounded_box_temp(self, x, y, z, size_x, size_y, size_z, radius):
        radius = max(0.0, min(radius, size_x / 2.0, size_y / 2.0))
        if radius < 0.01:
            return self._box_temp(x, y, z, size_x, size_y, size_z)

        # Either slab collapses to zero thickness when the clamped radius is
        # exactly half of that dimension; Fusion rejects such boxes.
        target = None
        if size_x - 2.0 * radius > 0.01:
            target = self._box_temp(
                x + radius, y, z, size_x - 2.0 * radius, size_y, size_z
            )
        if size_y - 2.0 * radius > 0.01:
            cross_box = self._box_temp(
                x, y + radius, z, size_x, size_y - 2.0 * radius, size_z
            )
            if target:
                self._boolean(
                    target, cross_box, adsk.fusion.BooleanTypes.UnionBooleanType
                )
            else:
                target = cross_box

        corner_centres = []
        for centre_x in (x + radius, x + size_x - radius):
            for centre_y in (y + radius, y + size_y - radius):
                centre = (round(centre_x, 6), round(centre_y, 6))
                if centre not in corner_centres:
                    corner_centres.append(centre)
        for centre_x, centre_y in corner_centres:
            corner = self._cylinder_temp(
                (centre_x, centre_y, z),
                (centre_x, centre_y, z + size_z),
                radius,
            )
            if target:
                self._boolean(
                    target, corner, adsk.fusion.BooleanTypes.UnionBooleanType
                )
            else:
                target = corner
        return target

    def _boolean(self, target, tool, operation):
        if not self.temp.booleanOperation(target, tool, operation):
            raise RuntimeError("Temporary B-Rep boolean operation failed")

    def _persist(
        self,
        component,
        transient_body,
        name,
        appearance=None,
        opacity=1.0,
    ):
        body = component.bRepBodies.add(transient_body)
        if not body:
            raise RuntimeError("Could not persist body: {}".format(name))
        body.name = name
        if appearance in self.appearances:
            try:
                body.appearance = self.appearances[appearance]
            except Exception:
                pass
        if opacity < 1.0:
            try:
                body.opacity = opacity
            except Exception:
                pass
        self.body_count += 1
        return body

    def add_box(
        self,
        component,
        name,
        x,
        y,
        z,
        size_x,
        size_y,
        size_z,
        appearance=None,
        opacity=1.0,
    ):
        return self._persist(
            component,
            self._box_temp(x, y, z, size_x, size_y, size_z),
            name,
            appearance,
            opacity,
        )

    def add_rounded_box(
        self,
        component,
        name,
        x,
        y,
        z,
        size_x,
        size_y,
        size_z,
        radius,
        appearance=None,
        opacity=1.0,
    ):
        return self._persist(
            component,
            self._rounded_box_temp(x, y, z, size_x, size_y, size_z, radius),
            name,
            appearance,
            opacity,
        )

    def add_cylinder(
        self,
        component,
        name,
        start,
        end,
        radius,
        appearance=None,
        opacity=1.0,
        end_radius=None,
    ):
        return self._persist(
            component,
            self._cylinder_temp(start, end, radius, end_radius),
            name,
            appearance,
            opacity,
        )

    def add_hollow_rounded_box(
        self,
        component,
        name,
        x,
        y,
        z,
        size_x,
        size_y,
        size_z,
        radius,
        wall,
        bottom,
        appearance=None,
        opacity=1.0,
    ):
        outer = self._rounded_box_temp(
            x, y, z, size_x, size_y, size_z, radius
        )
        inner = self._rounded_box_temp(
            x + wall,
            y + wall,
            z + bottom,
            size_x - 2.0 * wall,
            size_y - 2.0 * wall,
            size_z - bottom + 1.0,
            max(1.0, radius - wall),
        )
        self._boolean(outer, inner, adsk.fusion.BooleanTypes.DifferenceBooleanType)
        return self._persist(component, outer, name, appearance, opacity)

    def add_rounded_ring(
        self,
        component,
        name,
        x,
        y,
        z,
        size_x,
        size_y,
        size_z,
        radius,
        border,
        appearance=None,
        opacity=1.0,
    ):
        outer = self._rounded_box_temp(
            x, y, z, size_x, size_y, size_z, radius
        )
        inner = self._rounded_box_temp(
            x + border,
            y + border,
            z - 0.5,
            size_x - 2.0 * border,
            size_y - 2.0 * border,
            size_z + 1.0,
            max(1.0, radius - border),
        )
        self._boolean(outer, inner, adsk.fusion.BooleanTypes.DifferenceBooleanType)
        return self._persist(component, outer, name, appearance, opacity)

    def add_component(self, name, translation=(0.0, 0.0, 0.0)):
        transform = adsk.core.Matrix3D.create()
        transform.translation = vector(*translation)
        occurrence = self.root.occurrences.addNewComponent(transform)
        if not occurrence:
            raise RuntimeError("Could not create component: {}".format(name))
        occurrence.component.name = name
        try:
            occurrence.component.attributes.add(
                "SmartFarmPrototype", "Role", name
            )
        except Exception:
            pass
        self.component_count += 1
        return occurrence.component

    # ------------------------------------------------------------------
    # Assembly
    # ------------------------------------------------------------------

    def build(self):
        # Fusion owns the root component name and rejects attempts to rename it.
        # Browser-friendly names are applied to every child component instead.
        try:
            self.root.attributes.add(
                "SmartFarmPrototype", "SourceUnits", "millimetres"
            )
        except Exception:
            pass

        self.build_base_tray()
        self.build_heating_cassette()
        self.build_planter()
        self.build_electronics()
        self.build_sensor_array()
        self.build_lighting_arch()
        self.build_irrigation_tank()

    def build_base_tray(self):
        component = self.add_component("00_Base_Tray")
        base = CONFIG["base"]
        width = base["width"]
        depth = base["depth"]
        height = base["height"]

        self.add_rounded_box(
            component,
            "Low_Base_Tray",
            -width / 2.0,
            -depth / 2.0,
            0,
            width,
            depth,
            height,
            14,
            "platform",
        )
        for index, (x, y) in enumerate(
            ((-202, -127), (176, -127), (-202, 101), (176, 101)), start=1
        ):
            self.add_rounded_box(
                component,
                "Tray_Foot_{:02d}".format(index),
                x,
                y,
                -9,
                26,
                26,
                9,
                6,
                "platform_dark",
            )

        # The rear strip gathers cables without raising the tray profile.
        # Three dark inserts suggest accessible cable passages.
        self.add_rounded_box(
            component,
            "Rear_Cable_Spine",
            -200,
            130,
            20,
            400,
            8,
            12,
            3,
            "platform_dark",
        )
        for index, x in enumerate((-130, 0, 130), start=1):
            self.add_cylinder(
                component,
                "Cable_Spine_Port_{:02d}".format(index),
                (x, 129, 26),
                (x, 139, 26),
                3,
                "black",
            )

        self.add_rounded_box(
            component,
            "Front_Status_Badge",
            -42,
            -143,
            6,
            84,
            5,
            9,
            2,
            "platform_dark",
        )
        for index, (x, appearance) in enumerate(
            ((-15, "plant"), (0, "lighting"), (15, "water")), start=1
        ):
            self.add_cylinder(
                component,
                "Status_Light_{:02d}".format(index),
                (x, -145, 11),
                (x, -139, 11),
                2.2,
                appearance,
            )

        # These rails carry only the planter's side edges.  Their open centre
        # is a 14 mm-high, front-loading cassette bay.
        for name, x in (("Left", -155), ("Right", 25)):
            self.add_rounded_box(
                component,
                "Planter_Support_Rail_{}".format(name),
                x,
                -80,
                20,
                20,
                160,
                14,
                4,
                "platform_dark",
            )
        self.add_rounded_box(
            component,
            "Heating_Slot_Front_Marker",
            -90,
            -86,
            20,
            70,
            6,
            1,
            2,
            "heating",
        )

        # The tank lands between four raised stops with a visible one-millimetre
        # release gap on each side, reinforcing that it lifts off the dock.
        self.add_rounded_box(
            component,
            "Irrigation_Dock_Plate",
            104,
            30,
            20,
            100,
            100,
            4,
            7,
            "water_dark",
        )
        for index, (x, y) in enumerate(
            ((104, 31), (195, 31), (104, 111), (195, 111)), start=1
        ):
            self.add_rounded_box(
                component,
                "Tank_Dock_Stop_{:02d}".format(index),
                x,
                y,
                24,
                9,
                18,
                12,
                2,
                "platform_dark",
            )

    def build_heating_cassette(self):
        exploded = (0.0, -120.0, 0.0) if CONFIG["exploded_view"] else (0, 0, 0)
        origin = (-130 + exploded[0], -75 + exploded[1], 21 + exploded[2])
        component = self.add_component("10_Soil_Heating_Cassette", origin)

        # A 150 x 150 x 12 mm carrier has five millimetres of lateral clearance
        # inside the rail-to-rail opening and one millimetre vertically.
        self.add_rounded_ring(
            component,
            "Cassette_Frame",
            0,
            0,
            0,
            150,
            150,
            12,
            8,
            5,
            "platform_dark",
        )
        self.add_rounded_box(
            component,
            "Silicone_Heating_Pad",
            6,
            6,
            7,
            138,
            138,
            4.5,
            6,
            "heating",
        )
        for index, x in enumerate((20, 46, 72, 98, 124), start=1):
            self.add_box(
                component,
                "Heating_Trace_{:02d}".format(index),
                x,
                14,
                11.5,
                3,
                122,
                0.5,
                "heating_dark",
            )

        self.add_rounded_box(
            component,
            "Heating_Pull_Tab",
            45,
            -28,
            3,
            60,
            28,
            6,
            7,
            "heating",
        )
        self.add_cylinder(
            component,
            "Heating_Tab_Finger_Bar",
            (55, -19, 9),
            (95, -19, 9),
            3,
            "platform_dark",
        )

        self.add_rounded_box(
            component,
            "Heating_Rear_Connector",
            56,
            146,
            2,
            38,
            8,
            8,
            2,
            "black",
        )
        for index, x in enumerate((64, 75, 86), start=1):
            self.add_cylinder(
                component,
                "Heating_Contact_Pin_{:02d}".format(index),
                (x, 154, 6),
                (x, 164, 6),
                1.6,
                "metal",
            )

    def build_planter(self):
        planter = CONFIG["planter"]
        component = self.add_component("20_Planter", (-155, -80, 34))

        shell = self._rounded_box_temp(
            0,
            0,
            0,
            planter["width"],
            planter["depth"],
            planter["height"],
            planter["corner_radius"],
        )
        inner = self._rounded_box_temp(
            planter["wall"],
            planter["wall"],
            planter["bottom"],
            planter["width"] - 2 * planter["wall"],
            planter["depth"] - 2 * planter["wall"],
            planter["height"] - planter["bottom"] + 1,
            planter["corner_radius"] - planter["wall"],
        )
        self._boolean(shell, inner, adsk.fusion.BooleanTypes.DifferenceBooleanType)
        for drain_x in (68, 100, 132):
            drain = self._cylinder_temp(
                (drain_x, 80, -1), (drain_x, 80, planter["bottom"] + 1), 3
            )
            self._boolean(
                shell, drain, adsk.fusion.BooleanTypes.DifferenceBooleanType
            )
        self._persist(component, shell, "Planter_Shell", "white")

        self.add_rounded_ring(
            component,
            "Planter_Top_Rim",
            -4,
            -4,
            planter["height"] - 8,
            planter["width"] + 8,
            planter["depth"] + 8,
            8,
            planter["corner_radius"] + 4,
            8,
            "white",
        )
        self.add_rounded_box(
            component,
            "Growing_Medium",
            7,
            7,
            56,
            186,
            146,
            9,
            12,
            "soil",
        )

        # Six low herb clumps keep the lighting and irrigation volumes open.
        herbs = (
            (38, 45, 65, 18, 10, "plant"),
            (72, 105, 65, 25, 12, "plant_light"),
            (103, 62, 65, 22, 11, "plant"),
            (133, 109, 65, 16, 9, "plant_light"),
            (160, 47, 65, 27, 13, "plant"),
            (111, 128, 65, 19, 9, "plant_light"),
        )
        for index, (x, y, z, stem_h, crown_r, appearance) in enumerate(
            herbs, start=1
        ):
            self.add_cylinder(
                component,
                "Herb_Stem_{:02d}".format(index),
                (x, y, z),
                (x, y, z + stem_h),
                1.7,
                "plant",
            )
            self.add_cylinder(
                component,
                "Herb_Canopy_{:02d}".format(index),
                (x, y, z + stem_h - 5),
                (x, y, z + stem_h + 5),
                crown_r,
                appearance,
                end_radius=crown_r * 0.55,
            )

    def build_electronics(self):
        component = self.add_component("30_Controller_and_Breadboard", (72, -112, 20))

        self.add_rounded_box(
            component,
            "Electronics_Tray",
            0,
            0,
            0,
            136,
            140,
            4,
            8,
            "platform_dark",
        )
        self.add_box(component, "Tray_Left_Wall", 0, 5, 4, 4, 130, 14, "white")
        self.add_box(component, "Tray_Right_Wall", 132, 5, 4, 4, 130, 14, "white")
        self.add_box(component, "Tray_Rear_Wall", 4, 136, 4, 128, 4, 14, "white")

        # The enlarged breadboard now carries the controller and both air sensors.
        self.add_rounded_box(
            component,
            "Solderless_Breadboard",
            10,
            42,
            7,
            116,
            86,
            6,
            3,
            "white",
        )
        self.add_box(component, "Breadboard_Centre_Gap", 13, 83, 13, 110, 4, 1, "black")
        self.add_box(component, "Power_Rail_Positive", 14, 46, 13, 108, 1.4, 0.7, "heating")
        self.add_box(component, "Power_Rail_Negative", 14, 123, 13, 108, 1.4, 0.7, "water_dark")
        hole_index = 1
        for hole_y in (54, 62, 71, 78, 92, 99, 108, 116):
            for hole_x in range(18, 119, 10):
                self.add_cylinder(
                    component,
                    "Breadboard_Hole_{:02d}".format(hole_index),
                    (hole_x, hole_y, 13),
                    (hole_x, hole_y, 13.7),
                    0.9,
                    "black",
                )
                hole_index += 1

        # An Arduino Nano Every plugs across the breadboard's centre trench.
        for name, y in (("Left", 76), ("Right", 90)):
            self.add_box(
                component,
                "Nano_{}_Pin_Header".format(name),
                45.5,
                y,
                13,
                45,
                2,
                3,
                "black",
            )
        self.add_rounded_box(
            component,
            "Arduino_Nano_Every_PCB",
            45.5,
            75,
            16,
            45,
            18,
            2,
            1.5,
            "pcb",
        )
        self.add_box(component, "Nano_MCU_Package", 64.5, 80.5, 18, 7, 7, 1.5, "black")
        self.add_box(component, "Nano_USB_C_Port", 41.5, 80, 17, 9, 8, 3, "metal")
        for name, x, appearance in (
            ("Power", 81, "lighting"),
            ("Status", 85, "heating"),
        ):
            self.add_cylinder(
                component,
                "Nano_{}_LED".format(name),
                (x, 78.5, 18),
                (x, 78.5, 19),
                0.8,
                appearance,
            )

        # Upright DHT-style temperature/humidity module, with pins in one row.
        for index, x in enumerate((21, 25, 29, 33), start=1):
            self.add_cylinder(
                component,
                "DHT_Pin_{:02d}".format(index),
                (x, 56, 13),
                (x, 56, 17),
                0.45,
                "metal",
            )
        self.add_box(component, "DHT_Backing_PCB", 19, 55, 17, 14, 2, 18, "sensor")
        self.add_rounded_box(
            component,
            "DHT_Temperature_Humidity_Body",
            20,
            57,
            19,
            12,
            7,
            16,
            1.5,
            "water",
        )
        for index, z in enumerate((22, 25.5, 29, 32.5), start=1):
            self.add_box(
                component,
                "DHT_Grille_{:02d}".format(index),
                22,
                63.5,
                z,
                8,
                0.8,
                1,
                "black",
            )

        # A separate breadboard row carries the upright ambient-light module.
        for index, x in enumerate((107, 110, 113), start=1):
            self.add_cylinder(
                component,
                "Ambient_Light_Pin_{:02d}".format(index),
                (x, 104, 13),
                (x, 104, 17),
                0.45,
                "metal",
            )
        self.add_box(component, "Ambient_Light_Sensor_PCB", 105, 103, 17, 10, 2, 14, "sensor")
        self.add_cylinder(
            component,
            "Ambient_Photoresistor_Head",
            (110, 105, 28.5),
            (110, 109, 33),
            2.5,
            "clear",
            0.65,
        )

        self.add_box(component, "Front_IO_Panel", 90, -2, 4, 38, 5, 18, "black")
        self.add_box(component, "OLED_Display", 96, -3, 9, 26, 1, 9, "water")
        for index, x in enumerate((101, 108, 115, 122), start=1):
            self.add_cylinder(
                component,
                "Status_LED_{:02d}".format(index),
                (x, -4, 18),
                (x, -1, 18),
                1.2,
                "lighting" if index < 4 else "heating",
            )

    def build_sensor_array(self):
        component = self.add_component("40_Environmental_Sensor_Array")

        # A capacitive moisture paddle occupies a clear patch of planter soil.
        self.add_box(
            component,
            "Soil_Moisture_Paddle",
            -131,
            8.5,
            55,
            22,
            3,
            56,
            "sensor",
        )
        self.add_box(
            component,
            "Soil_Moisture_Module_PCB",
            -133,
            7.5,
            110,
            26,
            5,
            20,
            "sensor",
        )
        for index, x in enumerate((-127, -117), start=1):
            self.add_box(
                component,
                "Soil_Moisture_Trace_{:02d}".format(index),
                x,
                8.1,
                62,
                2,
                0.6,
                41,
                "metal",
            )

        # A sheathed temperature probe reaches into the soil beside the herbs.
        self.add_cylinder(
            component,
            "Soil_Temperature_Probe",
            (-91, -53, 55),
            (-91, -53, 114),
            3,
            "metal",
        )
        self.add_cylinder(
            component,
            "Soil_Temperature_Cable_Collar",
            (-91, -53, 112),
            (-91, -53, 118),
            4,
            "black",
        )
        cable_points = (
            ((-91, -53, 117), (-91, -79, 124)),
            ((-91, -79, 124), (55, -92, 50)),
            ((55, -92, 50), (76, -92, 38)),
        )
        for index, (start, end) in enumerate(cable_points, start=1):
            self.add_cylinder(
                component,
                "Soil_Temperature_Cable_{:02d}".format(index),
                start,
                end,
                1.2,
                "black",
            )

        # This dock-side strip reads the tank through its translucent wall.
        self.add_box(
            component,
            "Water_Level_Sensor",
            195,
            72,
            45,
            3,
            14,
            98,
            "sensor",
        )
        for index, z in enumerate(range(53, 137, 16), start=1):
            self.add_box(
                component,
                "Water_Level_Electrode_{:02d}".format(index),
                194,
                74,
                z,
                1,
                10,
                2,
                "metal",
            )

    def build_lighting_arch(self):
        exploded = (0.0, 0.0, 120.0) if CONFIG["exploded_view"] else (0, 0, 0)
        component = self.add_component("50_Lighting_Arch", exploded)

        # Each three-piece channel rests only on the rim top.  Its two vertical
        # faces retain a one-millimetre visual gap from the planter and rim.
        clips = (
            ("Left", -171, -160, -149),
            ("Right", 50, 39, 33),
        )
        for name, outer_x, top_x, inner_x in clips:
            self.add_box(
                component,
                "{}_Rim_Clip_Outer_Plate".format(name),
                outer_x,
                -20,
                103,
                11,
                40,
                16,
                "lighting",
            )
            self.add_box(
                component,
                "{}_Rim_Clip_Top_Plate".format(name),
                top_x,
                -20,
                119,
                11,
                40,
                5,
                "lighting",
            )
            self.add_box(
                component,
                "{}_Rim_Clip_Inner_Lip".format(name),
                inner_x,
                -20,
                103,
                6,
                40,
                16,
                "lighting",
            )

        # Legs stand directly on the clip outer plates (top face z=119).
        for name, x in (("Left", -178), ("Right", 50)):
            self.add_rounded_box(
                component,
                "{}_Arch_Leg".format(name),
                x,
                -9,
                119,
                18,
                18,
                150,
                4,
                "platform_dark",
            )
        self.add_rounded_box(
            component,
            "Arch_Top_Crossbar",
            -178,
            -9,
            265,
            246,
            18,
            16,
            4,
            "platform_dark",
        )

        self.add_rounded_ring(
            component,
            "LED_Panel_Frame",
            -155,
            -59,
            248,
            200,
            118,
            8,
            10,
            8,
            "white",
        )
        self.add_rounded_box(
            component,
            "LED_Diffuser",
            -147,
            -51,
            246,
            184,
            102,
            3,
            5,
            "lighting",
            0.68,
        )
        for index, y in enumerate((-42, -21, 0, 21, 42), start=1):
            self.add_box(
                component,
                "LED_Bar_{:02d}".format(index),
                -140,
                y,
                245,
                170,
                4,
                1,
                "lighting",
            )
        self.add_rounded_box(
            component,
            "LED_Panel_Backplate",
            -147,
            -51,
            255,
            184,
            102,
            2,
            5,
            "platform_dark",
        )
        for index, x in enumerate((-135, -102, -69, -36, -3, 30), start=1):
            self.add_box(
                component,
                "Panel_Heatsink_Fin_{:02d}".format(index),
                x,
                -40,
                257,
                3,
                80,
                7,
                "metal",
            )
        for index, x in enumerate((-140, 25), start=1):
            self.add_box(
                component,
                "Panel_Hanger_{:02d}".format(index),
                x,
                -5,
                257,
                10,
                10,
                8,
                "platform_dark",
            )

        self.add_cylinder(
            component,
            "Arch_Power_Cable",
            (-173, 12, 128),
            (-173, 12, 266),
            2,
            "black",
        )
        self.add_rounded_box(
            component,
            "Arch_Clip_Connector",
            -180,
            10,
            124,
            20,
            9,
            14,
            2,
            "black",
        )

    def build_irrigation_tank(self):
        exploded = (90.0, 0.0, 40.0) if CONFIG["exploded_view"] else (0, 0, 0)
        origin = (114 + exploded[0], 40 + exploded[1], 24 + exploded[2])
        component = self.add_component("60_Irrigation_Tank", origin)

        self.add_hollow_rounded_box(
            component,
            "Translucent_Water_Reservoir",
            0,
            0,
            0,
            80,
            84,
            130,
            10,
            2.5,
            4,
            "clear",
            0.30,
        )
        self.add_rounded_box(
            component,
            "Water_Volume",
            3,
            3,
            5,
            74,
            78,
            108,
            7,
            "water",
            0.58,
        )
        self.add_rounded_ring(
            component,
            "Reservoir_Top_Rim",
            -3,
            -3,
            126,
            86,
            90,
            6,
            12,
            6,
            "water_dark",
        )
        self.add_cylinder(
            component,
            "Reservoir_Fill_Cap",
            (40, 66, 130),
            (40, 66, 142),
            10,
            "water_dark",
        )

        # Two posts and a rounded crossbar form an unmistakable lift handle.
        for index, x in enumerate((20, 60), start=1):
            self.add_cylinder(
                component,
                "Tank_Handle_Post_{:02d}".format(index),
                (x, 30, 130),
                (x, 30, 151),
                5,
                "platform_dark",
            )
        self.add_cylinder(
            component,
            "Tank_Carry_Handle",
            (20, 30, 151),
            (60, 30, 151),
            5,
            "platform_dark",
        )

        # The pump remains on the front side; the orange coupling points left
        # toward the planter and can separate dry when the tank lifts away.
        self.add_rounded_box(
            component,
            "Pump_Housing",
            8,
            -10,
            8,
            44,
            14,
            34,
            4,
            "platform_dark",
        )
        self.add_cylinder(
            component,
            "Pump_Motor",
            (30, -16, 25),
            (30, -3, 25),
            9,
            "metal",
        )
        self.add_cylinder(
            component,
            "Dry_Break_Coupler",
            (8, -4, 22),
            (-10, -4, 22),
            6,
            "accent",
        )
        self.add_cylinder(
            component,
            "Pump_Outlet_Tube",
            (45, -3, 30),
            (76, -2, 50),
            2.5,
            "water",
            0.78,
        )

        # All tubing stays below z=200.  The manifold follows the planter's
        # rear inside edge at global y=74 and feeds three downward emitters.
        self.add_cylinder(
            component,
            "Irrigation_Riser_Tube",
            (76, -2, 50),
            (76, -2, 146),
            3,
            "water",
            0.78,
        )
        self.add_cylinder(
            component,
            "Irrigation_Horizontal_Run",
            (76, -2, 146),
            (-74, 34, 146),
            3,
            "water",
            0.78,
        )
        self.add_cylinder(
            component,
            "Manifold_Drop_Tube",
            (-74, 34, 146),
            (-74, 34, 126),
            3,
            "water",
            0.78,
        )
        self.add_cylinder(
            component,
            "Rear_Rim_Manifold",
            (-74, 34, 126),
            (-259, 34, 126),
            3,
            "water_dark",
        )
        for index, x in enumerate((-229, -169, -109), start=1):
            self.add_cylinder(
                component,
                "Drip_Line_{:02d}".format(index),
                (x, 34, 126),
                (x, 34, 112),
                1.7,
                "water",
                0.78,
            )
            self.add_cylinder(
                component,
                "Drip_Emitter_{:02d}".format(index),
                (x, 34, 112),
                (x, 34, 104),
                4,
                "water_dark",
                end_radius=2,
            )


def create_design(app: adsk.core.Application) -> adsk.fusion.Design:
    if CONFIG["create_new_document"]:
        app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)

    design = adsk.fusion.Design.cast(app.activeProduct)
    if not design:
        raise RuntimeError("The active product is not a Fusion design")

    # BRepBodies.add can directly persist temporary bodies in Direct Design.
    design.designType = adsk.fusion.DesignTypes.DirectDesignType
    return design


def run(context):
    ui = None
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        design = create_design(app)

        builder = SmartFarmBuilder(app, design)
        builder.build()

        adsk.doEvents()
        app.activeViewport.fit()
        app.activeViewport.refresh()

        if CONFIG["show_completion_dialog"]:
            view_name = "exploded" if CONFIG["exploded_view"] else "assembled"
            ui.messageBox(
                "Smart-farm prototype created.\n\n"
                "View: {}\nComponents: {}\nBodies: {}\n\n"
                "Edit CONFIG at the top of the script and rerun to iterate."
                .format(view_name, builder.component_count, builder.body_count),
                "Minimal Home SmartFarm",
            )
    except Exception:
        message = "Smart-farm build failed:\n{}".format(traceback.format_exc())
        if ui:
            ui.messageBox(message)
        else:
            print(message)
