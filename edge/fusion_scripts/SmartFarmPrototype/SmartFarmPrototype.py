"""Autodesk Fusion script: minimal modular home smart-farm prototype.

Run this file from Fusion's Scripts and Add-Ins dialog.  All source dimensions
are millimetres; Fusion API geometry is converted to its internal centimetres.

The model is intentionally a concept prototype rather than a production-ready
enclosure.  Edit CONFIG and the build_* methods, rerun, and inspect the newly
created document.
"""

from __future__ import annotations

import traceback

import adsk.core
import adsk.fusion


# -----------------------------------------------------------------------------
# User-editable prototype controls (millimetres)
# -----------------------------------------------------------------------------

CONFIG = {
    "platform": {"width": 430.0, "depth": 280.0, "height": 18.0},
    "planter": {
        "width": 200.0,
        "depth": 160.0,
        "height": 135.0,
        "wall": 5.0,
        "bottom": 7.0,
        "corner_radius": 18.0,
    },
    # Pulls the three removable modules away from their docks for presentation.
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

        target = self._box_temp(
            x + radius, y, z, size_x - 2.0 * radius, size_y, size_z
        )
        cross_box = self._box_temp(
            x, y + radius, z, size_x, size_y - 2.0 * radius, size_z
        )
        self._boolean(target, cross_box, adsk.fusion.BooleanTypes.UnionBooleanType)

        for centre_x in (x + radius, x + size_x - radius):
            for centre_y in (y + radius, y + size_y - radius):
                corner = self._cylinder_temp(
                    (centre_x, centre_y, z),
                    (centre_x, centre_y, z + size_z),
                    radius,
                )
                self._boolean(
                    target, corner, adsk.fusion.BooleanTypes.UnionBooleanType
                )
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
        self.root.name = "Minimal_Home_SmartFarm"
        try:
            self.root.attributes.add(
                "SmartFarmPrototype", "SourceUnits", "millimetres"
            )
        except Exception:
            pass

        self.build_platform()
        self.build_heating_module()
        self.build_planter()
        self.build_electronics()
        self.build_sensor_array()
        self.build_lighting_module()
        self.build_irrigation_module()

    def build_platform(self):
        component = self.add_component("00_Platform_and_Docks")
        width = CONFIG["platform"]["width"]
        depth = CONFIG["platform"]["depth"]
        height = CONFIG["platform"]["height"]

        self.add_rounded_box(
            component,
            "Platform_Deck",
            -width / 2.0,
            -depth / 2.0,
            0,
            width,
            depth,
            height,
            12,
            "platform",
        )
        for index, (x, y) in enumerate(
            ((-198, -123), (176, -123), (-198, 101), (176, 101)), start=1
        ):
            self.add_rounded_box(
                component,
                "AntiSlip_Foot_{:02d}".format(index),
                x,
                y,
                -8,
                22,
                22,
                8,
                5,
                "platform_dark",
            )

        # Rear cable spine and front status strip.
        self.add_rounded_box(
            component,
            "Rear_Cable_Spine",
            -175,
            112,
            18,
            350,
            15,
            9,
            4,
            "platform_dark",
        )
        self.add_rounded_box(
            component,
            "Front_Status_Badge",
            -35,
            -143,
            5,
            70,
            5,
            8,
            2,
            "sensor",
        )

        # Heating cassette receiver: open at the front for a slide-in module.
        self.add_box(
            component,
            "Heating_Rail_Left",
            -166,
            -74,
            18,
            5,
            168,
            12,
            "platform_dark",
        )
        self.add_box(
            component,
            "Heating_Rail_Right",
            50,
            -74,
            18,
            7,
            168,
            12,
            "platform_dark",
        )
        self.add_box(
            component,
            "Heating_Rear_Stop",
            -157,
            91,
            18,
            207,
            5,
            12,
            "platform_dark",
        )

        # Four outboard posts and inward ledges carry the planter without
        # piercing the heating cassette's swept slide-in volume.
        for index, (x, y, ledge_x, ledge_width) in enumerate(
            (
                (-176, -66, -176, 26),
                (61, -66, 40, 27),
                (-176, 68, -176, 26),
                (61, 68, 40, 27),
            ),
            start=1,
        ):
            self.add_box(
                component,
                "Planter_Riser_Post_{:02d}".format(index),
                x,
                y,
                18,
                6,
                18,
                20,
                "platform_dark",
            )
            self.add_box(
                component,
                "Planter_Riser_Ledge_{:02d}".format(index),
                ledge_x,
                y,
                34,
                ledge_width,
                18,
                4,
                "platform_dark",
            )

        # Keyed lighting mast socket: jaws, backstop and keyed centre boss.
        self.add_rounded_box(
            component,
            "Light_Dock_Base",
            -203,
            92,
            18,
            44,
            42,
            5,
            4,
            "platform_dark",
        )
        self.add_box(
            component,
            "Light_Dock_Left_Jaw",
            -201,
            96,
            23,
            6,
            34,
            23,
            "platform_dark",
        )
        self.add_box(
            component,
            "Light_Dock_Right_Jaw",
            -171,
            96,
            23,
            6,
            34,
            23,
            "platform_dark",
        )
        self.add_box(
            component,
            "Light_Dock_Backstop",
            -195,
            128,
            23,
            24,
            5,
            23,
            "platform_dark",
        )
        for index, x in enumerate((-195, -175), start=1):
            self.add_box(
                component,
                "Light_Dock_Key_Guide_{:02d}".format(index),
                x,
                90,
                23,
                4,
                8,
                12,
                "accent",
            )

        # Side docking clips for the irrigation tray.
        for index, x in enumerate((106, 178), start=1):
            self.add_box(
                component,
                "Irrigation_Dock_Front_Stop_{:02d}".format(index),
                x,
                27,
                18,
                19,
                3,
                12,
                "platform_dark",
            )
            self.add_box(
                component,
                "Irrigation_Dock_Rear_Stop_{:02d}".format(index),
                x,
                132,
                18,
                19,
                4,
                12,
                "platform_dark",
            )

    def build_heating_module(self):
        exploded = (0.0, -115.0, 32.0) if CONFIG["exploded_view"] else (0, 0, 0)
        origin = (-155 + exploded[0], -70 + exploded[1], 21 + exploded[2])
        component = self.add_component("10_Removable_Heating_Cassette", origin)

        self.add_rounded_box(
            component,
            "Heating_Cassette_Frame",
            0,
            0,
            0,
            200,
            160,
            7,
            9,
            "platform_dark",
        )
        self.add_rounded_box(
            component,
            "Silicone_Heating_Pad",
            8,
            8,
            7,
            184,
            144,
            3,
            7,
            "heating",
        )
        for index, x in enumerate((28, 62, 96, 130, 164), start=1):
            self.add_box(
                component,
                "Heating_Trace_{:02d}".format(index),
                x,
                17,
                10,
                6,
                126,
                0.8,
                "heating_dark",
            )

        self.add_box(
            component,
            "Slide_Key_Left",
            -4,
            4,
            1,
            4,
            150,
            5,
            "metal",
        )
        self.add_box(
            component,
            "Slide_Key_Right",
            200,
            4,
            1,
            4,
            150,
            5,
            "metal",
        )
        self.add_rounded_box(
            component,
            "Pull_Handle",
            61,
            -18,
            1,
            78,
            11,
            8,
            4,
            "platform_dark",
        )
        for x in (66, 128):
            self.add_box(
                component,
                "Handle_Bridge_{}".format(int(x)),
                x,
                -8,
                1,
                6,
                10,
                8,
                "platform_dark",
            )
        self.add_rounded_box(
            component,
            "Thermal_Connector",
            154,
            -12,
            2,
            31,
            17,
            9,
            3,
            "black",
        )
        for index, x in enumerate((160, 169, 178), start=1):
            self.add_cylinder(
                component,
                "Heating_Contact_{:02d}".format(index),
                (x, -13, 5),
                (x, -7, 5),
                2.2,
                "metal",
            )

    def build_planter(self):
        planter = CONFIG["planter"]
        component = self.add_component("20_Planter", (-155, -70, 38))

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
            118,
            186,
            146,
            9,
            12,
            "soil",
        )

        # Simple stylised crop makes the intended vertical clear at a glance.
        crops = (
            (49, 52, 127, 8, 52, 17),
            (102, 82, 127, 9, 68, 20),
            (151, 48, 127, 8, 47, 16),
        )
        for index, (x, y, z, stem_r, crop_h, crown_r) in enumerate(crops, start=1):
            self.add_cylinder(
                component,
                "Crop_Stem_{:02d}".format(index),
                (x, y, z),
                (x, y, z + crop_h),
                stem_r / 3.5,
                "plant",
            )
            self.add_cylinder(
                component,
                "Crop_Canopy_{:02d}".format(index),
                (x, y, z + crop_h - 19),
                (x, y, z + crop_h + 4),
                crown_r,
                "plant_light",
                end_radius=4,
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

        # Arduino-sized controller board and recognisable connector blocks.
        self.add_rounded_box(
            component,
            "Arduino_Formfactor_PCB",
            9,
            11,
            7,
            72,
            54,
            2,
            3,
            "pcb",
        )
        self.add_box(component, "MCU_Package", 36, 28, 9, 23, 11, 4, "black")
        self.add_box(component, "USB_Port", 7, 19, 8, 13, 15, 10, "metal")
        self.add_cylinder(
            component,
            "DC_Barrel_Jack",
            (18, 57, 13),
            (18, 66, 13),
            5.5,
            "black",
        )
        self.add_box(component, "Digital_Header", 25, 14, 9, 45, 5, 7, "black")
        self.add_box(component, "Analog_Header", 27, 56, 9, 36, 5, 7, "black")
        for index, (x, y) in enumerate(
            ((15, 17), (75, 17), (15, 59), (75, 59)), start=1
        ):
            self.add_cylinder(
                component,
                "Controller_Mount_{:02d}".format(index),
                (x, y, 9),
                (x, y, 11),
                1.7,
                "metal",
            )

        # Breadboard with power rails, centre trench and an abbreviated hole grid.
        self.add_rounded_box(
            component,
            "Solderless_Breadboard",
            15,
            78,
            7,
            105,
            50,
            6,
            3,
            "white",
        )
        self.add_box(component, "Breadboard_Centre_Gap", 18, 101, 13, 99, 4, 1, "black")
        self.add_box(component, "Power_Rail_Positive", 19, 82, 13, 97, 1.4, 0.7, "heating")
        self.add_box(component, "Power_Rail_Negative", 19, 123, 13, 97, 1.4, 0.7, "water_dark")
        hole_index = 1
        for hole_y in (89, 96, 110, 117):
            for hole_x in range(23, 114, 10):
                self.add_cylinder(
                    component,
                    "Breadboard_Hole_{:02d}".format(hole_index),
                    (hole_x, hole_y, 13),
                    (hole_x, hole_y, 13.7),
                    0.9,
                    "black",
                )
                hole_index += 1

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

        # Air temperature / humidity sensor on a slim planter-rim mast.
        self.add_box(component, "Air_Sensor_Mast", -151, 82, 39, 5, 5, 153, "metal")
        self.add_rounded_box(
            component,
            "Temperature_Humidity_Housing",
            -163,
            80,
            190,
            29,
            9,
            28,
            3,
            "white",
        )
        for index, z in enumerate((195, 201, 207, 213), start=1):
            self.add_box(
                component,
                "Air_Grille_{:02d}".format(index),
                -158,
                79,
                z,
                19,
                2,
                2.5,
                "sensor",
            )

        # Soil moisture board with two probes entering the growing medium.
        self.add_box(
            component,
            "Soil_Moisture_Board",
            -77,
            -1,
            151,
            28,
            4,
            18,
            "sensor",
        )
        for index, x in enumerate((-71, -57), start=1):
            self.add_box(
                component,
                "Soil_Probe_{:02d}".format(index),
                x,
                0,
                91,
                4,
                2,
                60,
                "metal",
            )

        # Horizontal ambient-light sensor on the planter rim.
        self.add_rounded_box(
            component,
            "Ambient_Light_Sensor_PCB",
            13,
            54,
            172,
            30,
            25,
            3,
            3,
            "sensor",
        )
        self.add_cylinder(
            component,
            "Lux_Photodiode",
            (28, 66, 175),
            (28, 66, 182),
            5,
            "clear",
            0.65,
            end_radius=3.5,
        )

        # Water-level strip lives inside the translucent irrigation reservoir.
        self.add_box(
            component,
            "Water_Level_Sensor",
            183,
            49,
            53,
            3,
            13,
            90,
            "sensor",
        )
        for index, z in enumerate(range(61, 137, 15), start=1):
            self.add_box(
                component,
                "Water_Level_Electrode_{:02d}".format(index),
                181,
                51,
                z,
                2,
                9,
                2,
                "metal",
            )

    def build_lighting_module(self):
        exploded = (-70.0, 0.0, 0.0) if CONFIG["exploded_view"] else (0, 0, 0)
        origin = (-195 + exploded[0], 98 + exploded[1], 23 + exploded[2])
        component = self.add_component("50_Removable_Lighting_Module", origin)

        self.add_rounded_box(
            component,
            "Keyed_Mast_Foot",
            0,
            0,
            0,
            24,
            30,
            22,
            3,
            "platform_dark",
        )
        self.add_box(component, "Mast_Foot_Key", 5, -7, 3, 14, 8, 8, "accent")
        self.add_rounded_box(
            component,
            "Lighting_Mast",
            2,
            5,
            22,
            20,
            20,
            255,
            4,
            "platform_dark",
        )
        self.add_box(
            component,
            "Top_Crossbar",
            12,
            4,
            266,
            225,
            18,
            16,
            "platform_dark",
        )
        for index, x in enumerate((30, 210), start=1):
            self.add_box(
                component,
                "Forward_Lamp_Support_{:02d}".format(index),
                x,
                -139,
                258,
                12,
                149,
                12,
                "platform_dark",
            )

        self.add_rounded_ring(
            component,
            "LED_Panel_Frame",
            20,
            -150,
            245,
            210,
            124,
            9,
            10,
            8,
            "white",
        )
        self.add_rounded_box(
            component,
            "LED_Diffuser",
            28,
            -142,
            242,
            194,
            108,
            4,
            5,
            "lighting",
            0.68,
        )
        for index, y in enumerate((-132, -112, -92, -72, -52), start=1):
            self.add_box(
                component,
                "LED_Bar_{:02d}".format(index),
                35,
                y,
                241,
                180,
                5,
                1.5,
                "lighting",
            )
        for index, x in enumerate((48, 80, 112, 144, 176, 208), start=1):
            self.add_box(
                component,
                "Panel_Heatsink_Fin_{:02d}".format(index),
                x,
                -136,
                254,
                3,
                96,
                8,
                "metal",
            )

        self.add_cylinder(
            component,
            "Mast_Power_Cable",
            (25, 16, 31),
            (25, 16, 258),
            2.3,
            "black",
        )
        for index, x in enumerate((7, 12, 17), start=1):
            self.add_cylinder(
                component,
                "Lighting_Dock_Contact_{:02d}".format(index),
                (x, 4, -1),
                (x, 4, 4),
                1.5,
                "metal",
            )

    def build_irrigation_module(self):
        exploded = (105.0, 0.0, 0.0) if CONFIG["exploded_view"] else (0, 0, 0)
        origin = (104 + exploded[0], 34 + exploded[1], 18 + exploded[2])
        component = self.add_component("60_Removable_Irrigation_Module", origin)

        self.add_rounded_box(
            component,
            "Irrigation_Docking_Tray",
            0,
            0,
            0,
            94,
            94,
            6,
            8,
            "water_dark",
        )
        for index, x in enumerate((5, 77), start=1):
            self.add_box(
                component,
                "Irrigation_Docking_Foot_{:02d}".format(index),
                x,
                -4,
                1,
                14,
                10,
                10,
                "metal",
            )
            self.add_box(
                component,
                "Irrigation_Rear_Latch_{:02d}".format(index),
                x,
                88,
                1,
                14,
                10,
                10,
                "metal",
            )

        self.add_hollow_rounded_box(
            component,
            "Translucent_Water_Reservoir",
            20,
            12,
            6,
            68,
            72,
            135,
            10,
            2.2,
            3.0,
            "clear",
            0.30,
        )
        self.add_rounded_box(
            component,
            "Water_Volume",
            23,
            15,
            10,
            62,
            66,
            95,
            8,
            "water",
            0.58,
        )
        self.add_rounded_ring(
            component,
            "Reservoir_Top_Rim",
            17,
            9,
            137,
            74,
            78,
            7,
            11,
            6,
            "water_dark",
        )
        self.add_cylinder(
            component,
            "Reservoir_Fill_Cap",
            (54, 48, 141),
            (54, 48, 151),
            15,
            "water_dark",
        )
        self.add_rounded_box(
            component,
            "Pump_Housing",
            -8,
            23,
            12,
            29,
            49,
            33,
            5,
            "platform_dark",
        )
        self.add_cylinder(
            component,
            "Pump_Motor",
            (6, 47, 20),
            (6, 47, 41),
            10,
            "metal",
        )
        self.add_cylinder(
            component,
            "Dry_Break_Coupler",
            (-13, 47, 32),
            (1, 47, 32),
            6,
            "accent",
        )

        # Rigid concept tubing and four removable drip emitters.
        self.add_cylinder(
            component,
            "Irrigation_Riser_Tube",
            (-2, 47, 42),
            (-2, 47, 175),
            3,
            "water",
            0.78,
        )
        self.add_cylinder(
            component,
            "Irrigation_Overhead_Tube",
            (-2, 47, 175),
            (-94, 47, 175),
            3,
            "water",
            0.78,
        )
        self.add_cylinder(
            component,
            "Irrigation_Manifold",
            (-94, -94, 175),
            (-94, 47, 175),
            3,
            "water_dark",
        )
        for index, y in enumerate((-74, -34, 6, 36), start=1):
            self.add_cylinder(
                component,
                "Drip_Line_{:02d}".format(index),
                (-94, y, 175),
                (-94, y, 145),
                2,
                "water",
                0.78,
            )
            self.add_cylinder(
                component,
                "Drip_Emitter_{:02d}".format(index),
                (-94, y, 144),
                (-94, y, 137),
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
